import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const ARTIFACTS = 'artifacts/e2e';
fs.mkdirSync(ARTIFACTS, { recursive: true });

const failures = [];
const consoleErrors = [];

function recordError(error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  failures.push(message);
  console.error(`\n✗ ${message}`);
}

function attachWatch(page, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = `${label}: ${message.text()}`;
      consoleErrors.push(text);
      console.error(`[console] ${text}`);
    }
  });
  page.on('pageerror', (error) => {
    const text = `${label}: pageerror ${error.message}`;
    consoleErrors.push(text);
    console.error(`[pageerror] ${text}`);
  });
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http')) return;
    try {
      const parsed = new URL(url);
      if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
        consoleErrors.push(`${label}: external request ${url}`);
      }
    } catch {
      // ignore
    }
  });
}

async function addOption(page, text) {
  if ((await page.locator('.objects-panel-head').count()) > 0) {
    await page.locator('.objects-panel-head .primary-small-button').click();
  } else {
    await page.locator('.sheet-quick-button').filter({ hasText: '添加' }).click();
  }
  await page.waitForTimeout(180);
  await page.locator('.action-option').filter({ hasText: text }).first().click();
  await page.waitForTimeout(750);
}

async function createIntersection(page, aLabel, bLabel) {
  await addOption(page, '交点');
  const dialog = page.locator('.intersection-dialog');
  await dialog
    .locator('select[aria-label="选择第一个对象"]')
    .selectOption({ label: aLabel });
  await dialog
    .locator('select[aria-label="选择第二个对象"]')
    .selectOption({ label: bLabel });
  await dialog.getByRole('button', { name: '创建交点' }).click();
  await page.waitForTimeout(750);
}

async function createMarkerLine(page, aName, bName) {
  await addOption(page, '两点连线');
  const dialog = page.locator('.marker-line-dialog');
  const pick = async (label, name) => {
    const select = dialog.locator(`select[aria-label="${label}"]`);
    const value = await select.locator('option').evaluateAll(
      (options, pointName) =>
        options.find((option) => (option.textContent ?? '').startsWith(`${pointName}（`))
          ?.value,
      name,
    );
    assert(value, `missing marked point ${name}`);
    await select.selectOption(value);
  };
  await pick('选择连线起点', aName);
  await pick('选择连线终点', bName);
  await dialog.getByRole('button', { name: '创建连线' }).click();
  await page.waitForTimeout(750);
}

async function createPerpendicular(page, pointName, lineLabel) {
  await addOption(page, '过点作垂线');
  const dialog = page.locator('.perpendicular-dialog');
  const pointSelect = dialog.locator('select[aria-label="选择垂线经过的标记点"]');
  const pointValue = await pointSelect.locator('option').evaluateAll(
    (options, name) =>
      options.find((option) => (option.textContent ?? '').startsWith(`${name}（`))
        ?.value,
    pointName,
  );
  assert(pointValue, `missing marked point ${pointName}`);
  await pointSelect.selectOption(pointValue);
  await dialog
    .locator('select[aria-label="选择垂直的直线"]')
    .selectOption({ label: lineLabel });
  await dialog.getByRole('button', { name: '创建垂线' }).click();
  await page.waitForTimeout(750);
}

async function expandCard(page, selector) {
  const card = page.locator(selector).first();
  if ((await card.locator('.card-body').count()) === 0) {
    await card.locator('.card-title-button').click();
    await page.waitForTimeout(250);
  }
  return card;
}

async function tickPositions(page) {
  return page.locator('.jxgbox svg text').evaluateAll((nodes) =>
    nodes.slice(0, 8).map((node) => {
      const rect = node.getBoundingClientRect();
      return [Math.round(rect.left), Math.round(rect.top), node.textContent];
    }),
  );
}

async function boardBounds(page) {
  return page.evaluate(() => {
    const boards = window.JXG?.boards;
    const board = boards ? Object.values(boards)[0] : null;
    return board?.getBoundingBox?.() ?? null;
  });
}

async function screenFor(page, x, y) {
  const box = await page.locator('.jxgbox').boundingBox();
  const bb = await boardBounds(page);
  assert(box && bb, 'board bounds missing');
  return {
    left: box.x + ((x - bb[0]) / (bb[2] - bb[0])) * box.width,
    top: box.y + ((bb[1] - y) / (bb[1] - bb[3])) * box.height,
  };
}

async function markPointAt(page, x, y) {
  await page.locator('.objects-panel-head .secondary-small-button').filter({ hasText: '标点' }).click();
  await page.waitForTimeout(250);
  const screen = await screenFor(page, x, y);
  await page.mouse.click(screen.left, screen.top);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.point-confirm-card').count(), 1, 'point confirmation missing');
  await page.locator('.point-confirm-card').getByRole('button', { name: '标记' }).click();
  await page.waitForTimeout(700);
}

async function curveElements(page) {
  return page.evaluate(() => {
    const boards = window.JXG?.boards;
    const board = boards ? Object.values(boards)[0] : null;
    if (!board?.objectsList) return 0;
    return board.objectsList.filter((object) => object.elType === 'curve').length;
  });
}

async function tracePixelCount(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.jxg-trace-overlay');
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0) return 0;
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 10) count += 1;
    }
    return count;
  });
}

async function runDesktop() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  attachWatch(page, 'desktop');
  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    assert.equal(await page.title(), '简图 · 数学画板');
    await page.locator('.jxgbox svg').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(
      await page.locator('.objects-panel-head .secondary-small-button').filter({ hasText: '画图' }).count(),
      0,
      'drawing button should be removed',
    );

    await page.getByRole('button', { name: /y = x²/ }).click();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.object-card[data-kind="explicit"]').count(), 1);

    const functionCard = await expandCard(page, '.object-card[data-kind="explicit"]');
    const expr = functionCard.locator('.expression-input').first();
    await expr.fill('a*x^2');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.parameter-row').count(), 1, 'parameter slider missing');
    const parameter = page.locator('.parameter-input').first();
    await parameter.fill('2');
    await page.waitForTimeout(300);

    const derivativeSwitch = functionCard.getByRole('switch', { name: '显示导函数' });
    await derivativeSwitch.click();
    await page.waitForTimeout(300);
    assert((await functionCard.locator('.derivative-box .katex').count()) > 0);
    await derivativeSwitch.click();
    await page.waitForTimeout(300);

    await markPointAt(page, 0, 0);
    await markPointAt(page, 1.5, 4.5);
    assert.equal(await page.locator('.marked-point-card').count(), 2, 'marked points missing');
    const markedTexts = await page.locator('.marked-point-card').allInnerTexts();
    assert(markedTexts.some((text) => text.includes('标记点 A')));
    assert(markedTexts.some((text) => text.includes('标记点 B')));

    await addOption(page, 'N 等分点');
    assert.equal(await page.locator('.division-card').count(), 1, 'division card missing');
    assert((await page.locator('.division-card').innerText()).includes('1 个内分点'));
    const divisionCard = page.locator('.division-card').first();
    const pixelsBeforeTrace = await tracePixelCount(page);
    await divisionCard.getByRole('switch', { name: '记录等分点轨迹' }).click();
    await page.waitForTimeout(300);
    const pointA = await page.evaluate(() => {
      const boards = window.JXG?.boards;
      const board = boards ? Object.values(boards)[0] : null;
      if (!board?.objectsList) return null;
      const gliders = board.objectsList.filter((object) => object.elType === 'glider');
      return gliders[0] ? { x: gliders[0].X(), y: gliders[0].Y() } : null;
    });
    assert(pointA, 'curve point glider missing');
    const start = await screenFor(page, pointA.x, pointA.y);
    const end = await screenFor(page, 1, 2);
    await page.mouse.move(start.left, start.top);
    await page.mouse.down();
    await page.mouse.move(end.left, end.top, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    assert(
      (await tracePixelCount(page)) > pixelsBeforeTrace,
      'division point trace was not drawn',
    );
    await page.screenshot({ path: `${ARTIFACTS}/desktop-2d-marked-points.png` });

    const functionCardForTangents = await expandCard(page, '.object-card[data-kind="explicit"]');
    const functionTangentButton = functionCardForTangents.getByRole('button', { name: /添加切线/ });
    await functionTangentButton.click();
    await page.waitForTimeout(500);
    await functionTangentButton.click();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.tangent-row').count(), 2, 'multiple tangents missing');

    await addOption(page, '隐式方程');
    const implicitCard = await expandCard(page, '.object-card[data-kind="implicit"]');
    await implicitCard.locator('.expression-input').first().fill('x^2/4 + y^2 = 1');
    await page.waitForTimeout(600);
    const implicitTangentButton = implicitCard.getByRole('button', { name: /添加切线/ });
    await implicitTangentButton.click();
    await page.waitForTimeout(500);
    await implicitTangentButton.click();
    await page.waitForTimeout(700);

    await addOption(page, '切线夹角约束');
    assert.equal(await page.locator('.tangent-angle-card').count(), 1, 'tangent angle card missing');
    assert(
      (await page.locator('.tangent-angle-card').first().innerText()).includes('90'),
      'default tangent angle should be 90',
    );
    assert.equal(
      await page.locator('.tangent-intersection-card').count(),
      1,
      'angle constraint did not create the tangent intersection automatically',
    );
    const coordinateLabels = await page.locator('.jxgbox .JXGtext').allTextContents();
    assert(
      !coordinateLabels.some((text) => /^\(.*,.*\)$/.test(text.trim())),
      'intersection coordinates should be hidden by default',
    );
    await page.screenshot({ path: `${ARTIFACTS}/desktop-2d-tangent-features.png` });

    const tangentCard = page.locator('.tangent-intersection-card').first();
    if ((await tangentCard.locator('.card-body').count()) === 0) {
      await tangentCard.locator('.card-title-button').click();
      await page.waitForTimeout(250);
    }
    await tangentCard.getByRole('switch', { name: '显示交点坐标' }).click();
    await page.waitForTimeout(350);
    const shownCoordinateLabels = await page.locator('.jxgbox .JXGtext').allTextContents();
    assert(
      shownCoordinateLabels.some((text) => /^\(.*,.*\)$/.test(text.trim())),
      'intersection coordinates were not shown after enabling',
    );
    const traceSwitch = tangentCard.getByRole('switch', { name: '记录切线交点轨迹' });
    assert(await traceSwitch.isChecked(), 'auto tangent trace should be enabled');
    await tangentCard.getByRole('button', { name: '推导交点轨迹方程' }).click();
    await page.waitForTimeout(300);
    assert.equal(
      await tangentCard.locator('.locus-result').count(),
      1,
      'tangent locus result was not shown',
    );
    const tangentGlider = await page.evaluate(() => {
      const boards = window.JXG?.boards;
      const board = boards ? Object.values(boards)[0] : null;
      if (!board?.objectsList) return null;
      const glider = board.objectsList.find(
        (object) =>
          object.elType === 'glider' && object.name !== 'A' && object.name !== 'B',
      );
      return glider ? { x: glider.X(), y: glider.Y() } : null;
    });
    assert(tangentGlider, 'tangent glider missing');
    const tangentPixelsBefore = await tracePixelCount(page);
    const tangentStart = await screenFor(page, tangentGlider.x, tangentGlider.y);
    await page.mouse.move(tangentStart.left, tangentStart.top);
    await page.mouse.down();
    for (let index = 1; index <= 16; index += 1) {
      await page.mouse.move(tangentStart.left + index * 14, tangentStart.top + index * 8);
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
    await page.waitForTimeout(700);
    assert(
      (await tracePixelCount(page)) > tangentPixelsBefore,
      'tangent intersection trace was not drawn',
    );
    await page.screenshot({ path: `${ARTIFACTS}/desktop-2d-tangent-trace.png` });

    const autoCard = page.locator('.marked-point-card').first();
    if ((await autoCard.locator('.card-body').count()) === 0) {
      await autoCard.locator('.card-title-button').click();
      await page.waitForTimeout(250);
    }
    await autoCard.getByRole('switch', { name: '自动移动 A' }).click();
    const markedPointBeforeAuto = await autoCard.innerText();
    await page
      .locator('.objects-panel-head .secondary-small-button')
      .filter({ hasText: '自动移动' })
      .click();
    await page.waitForTimeout(1100);
    const markedPointAfterAuto = await autoCard.innerText();
    assert.notEqual(
      markedPointAfterAuto,
      markedPointBeforeAuto,
      'selected marked point did not move automatically',
    );
    await page
      .locator('.objects-panel-head .secondary-small-button')
      .filter({ hasText: '暂停' })
      .click();

    const functionCardAgain = await expandCard(page, '.object-card[data-kind="explicit"]');
    const functionInputAgain = functionCardAgain.locator('.expression-input').first();
    await functionInputAgain.fill('sin(');
    await page.waitForTimeout(400);
    assert((await page.locator('.field-error').count()) > 0);
    await functionInputAgain.fill('a*x + b*x + c + d');
    await page.waitForTimeout(500);
    assert(
      (await page.locator('.field-error').allInnerTexts()).some((text) =>
        text.includes('最多支持 3 个参数'),
      ),
      '2D parameter cap not enforced',
    );
    await functionInputAgain.fill('a*x^2');
    await page.waitForTimeout(500);

    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    assert.equal(await page.locator('.object-card[data-kind]').count(), 2, 'expression persistence failed');
    assert.equal(await page.locator('.tangent-angle-card').count(), 1, 'angle constraint persistence failed');
    assert.equal(await page.locator('.tangent-intersection-card').count(), 1, 'intersection persistence failed');
    assert.equal(await page.locator('.marked-point-card').count(), 7, 'marked point persistence failed');
    assert.equal(await page.locator('.division-card').count(), 1, 'division persistence failed');

    const tickBefore = await tickPositions(page);
    const boardBox = await page.locator('.jxgbox').boundingBox();
    assert(boardBox, '2D board missing');
    await page.mouse.move(boardBox.x + boardBox.width * 0.7, boardBox.y + boardBox.height * 0.4);
    await page.mouse.wheel(0, -420);
    await page.waitForTimeout(600);
    assert.notDeepEqual(await tickPositions(page), tickBefore, 'mouse wheel did not zoom');
    await page.getByRole('button', { name: '复位视图' }).click();
    await page.waitForTimeout(500);

    const ticksBeforePan = await tickPositions(page);
    await page.mouse.move(boardBox.x + boardBox.width * 0.82, boardBox.y + boardBox.height * 0.82);
    await page.mouse.down();
    await page.mouse.move(boardBox.x + boardBox.width * 0.68, boardBox.y + boardBox.height * 0.7, {
      steps: 10,
    });
    await page.mouse.up();
    await page.waitForTimeout(600);
    assert.notDeepEqual(await tickPositions(page), ticksBeforePan, 'plain mouse drag did not pan');
    await page.getByRole('button', { name: '复位视图' }).click();
    await page.waitForTimeout(400);

    await page.getByRole('tab', { name: /3D 空间/ }).click();
    await page.waitForTimeout(1600);
    await page.locator('.scene3d-canvas canvas').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.example-button').filter({ hasText: '平面' }).click();
    await page.waitForTimeout(1400);
    const implicit3DCard = page.locator('.object-card').first();
    assert((await implicit3DCard.innerText()).includes('隐式曲面'));
    const implicit3DInput = implicit3DCard.locator('.expression-input').first();
    await implicit3DInput.fill('x^2 + y^2 + z^2 = 4');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${ARTIFACTS}/desktop-3d-implicit.png` });

    await implicit3DInput.fill('a*x + b*y + c*z + d');
    await page.waitForTimeout(700);
    assert.equal(await implicit3DCard.locator('.field-error').count(), 0, '4 params should be allowed in 3D');
    await implicit3DInput.fill('a*x + b*y + c*z + d + f');
    await page.waitForTimeout(700);
    assert(
      (await implicit3DCard.locator('.field-error').innerText()).includes('最多支持 4 个参数'),
      '3D parameter cap not enforced',
    );
  } catch (error) {
    recordError(error);
  } finally {
    await context.close();
  }
}

async function runMobile() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  attachWatch(page, 'mobile');
  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      false,
    );
    assert.equal(
      await page.locator('.sheet-quick-button').filter({ hasText: '画图' }).count(),
      0,
      'mobile drawing button should be removed',
    );
    await page.getByRole('button', { name: /y = x²/ }).click();
    await page.waitForTimeout(500);
    await page.locator('.sheet-title').click();
    await page.waitForTimeout(400);
    await page.locator('.object-card[data-kind="explicit"] .expression-input').first().fill('sin(x)');
    await page.waitForTimeout(500);
    await page.locator('.sheet-title').click();
    await page.waitForTimeout(300);
    await page.locator('.sheet-quick-button').filter({ hasText: '标点' }).tap();
    await page.waitForTimeout(300);
    const mobilePoint = await screenFor(page, 0, 0);
    await page.touchscreen.tap(mobilePoint.left, mobilePoint.top);
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.point-confirm-card').count(), 1, 'mobile point confirmation missing');
    await page.locator('.point-confirm-card').getByRole('button', { name: '标记' }).tap();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.marked-point-card').count(), 1, 'mobile marked point missing');
    assert((await page.locator('.marked-point-card').innerText()).includes('标记点 A'));
    await page.screenshot({ path: `${ARTIFACTS}/mobile-2d-marked-point.png` });

    await addOption(page, '隐式方程');
    assert.equal(await page.locator('.object-card[data-kind]').count(), 2, 'mobile add failed');
    await page.screenshot({ path: `${ARTIFACTS}/mobile-2d-implicit.png` });

    await page.getByRole('tab', { name: '空间' }).click();
    await page.waitForTimeout(1600);
    await page.locator('.scene3d-canvas canvas').waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.example-button').filter({ hasText: '球面' }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${ARTIFACTS}/mobile-3d.png` });
  } catch (error) {
    recordError(error);
  } finally {
    await context.close();
  }

  const landscape = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const landscapePage = await landscape.newPage();
  attachWatch(landscapePage, 'landscape');
  try {
    await landscapePage.goto(APP_URL, { waitUntil: 'networkidle' });
    await landscapePage.waitForTimeout(500);
    await landscapePage.getByRole('button', { name: /y = x²/ }).click();
    await landscapePage.waitForTimeout(400);
    await landscapePage.locator('.sheet-title').click();
    await landscapePage.waitForTimeout(500);
    const sheet = await landscapePage.locator('.mobile-sheet').boundingBox();
    assert(sheet && sheet.width < 844 * 0.6, 'landscape sheet is not a side panel');
    await landscapePage.screenshot({ path: `${ARTIFACTS}/mobile-landscape.png` });
  } catch (error) {
    recordError(error);
  } finally {
    await landscape.close();
  }
}

async function runUnifiedTools() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  attachWatch(page, 'unified-tools');
  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /y = x²/ }).click();
    await page.waitForTimeout(400);

    await createIntersection(page, '函数 y = x^2', 'x 轴');
    assert.equal(await page.locator('.intersection-card').count(), 1, 'axis intersection missing');
    assert(
      (await page.locator('.marked-point-card').first().innerText()).includes('交点 A'),
      'intersection was not registered as a marked point',
    );
    const originCard = page.locator('.marked-point-card').first();
    if ((await originCard.locator('.card-body').count()) === 0) {
      await originCard.locator('.card-title-button').click();
      await page.waitForTimeout(250);
    }
    assert((await originCard.innerText()).includes('交点来源'), 'intersection origin missing');
    assert((await originCard.innerText()).includes('x 轴'), 'intersection source label missing');
    await originCard.getByRole('button', { name: '查看交点详情' }).click();
    await page.waitForTimeout(300);
    assert.equal(
      await page.locator('.intersection-card .card-body').count(),
      1,
      'intersection detail did not open',
    );
    assert.equal(
      await page.locator('.intersection-card').getByRole('switch', { name: '记录交点轨迹' }).count(),
      0,
      'generic intersection should not expose trace',
    );

    await page.locator('.objects-panel-head .primary-small-button').click();
    await page.waitForTimeout(150);
    await page.locator('.action-option').filter({ hasText: '函数' }).first().click();
    await page.waitForTimeout(500);
    const secondCard = page.locator('.object-card[data-kind="explicit"]').nth(1);
    if ((await secondCard.locator('.card-body').count()) === 0) {
      await secondCard.locator('.card-title-button').click();
      await page.waitForTimeout(200);
    }
    await secondCard.locator('.expression-input').first().fill('1');
    await page.waitForTimeout(700);
    await createIntersection(page, '函数 y = x^2', '函数 y = 1');
    assert.equal(await page.locator('.intersection-card').count(), 2, 'curve intersection missing');

    await createMarkerLine(page, 'A', 'B');
    assert.equal(await page.locator('.marker-line-card').count(), 1, 'marker line missing');
    assert((await page.locator('.marker-line-card').innerText()).includes('两点连线'));
    await page.screenshot({ path: `${ARTIFACTS}/desktop-2d-unified-intersection.png` });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.intersection-card').count(), 2, 'intersections did not persist');
    assert.equal(await page.locator('.marker-line-card').count(), 1, 'marker line did not persist');
    assert.equal(
      await page.locator('.marked-point-card').filter({ hasText: '交点' }).count(),
      3,
      'auto intersection markers did not persist',
    );
  } catch (error) {
    recordError(error);
  } finally {
    await context.close();
  }
}

async function runCoincidentPoints() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  attachWatch(page, 'coincident-points');
  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /y = x²/ }).click();
    await page.waitForTimeout(400);
    await createIntersection(page, '函数 y = x^2', 'x 轴');
    await createIntersection(page, '函数 y = x^2', 'x 轴');
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.intersection-card').count(), 2, 'duplicate intersections missing');
    assert.equal(
      await page.locator('.marked-point-card').count(),
      1,
      'coincident intersection points were not deduplicated',
    );
    const labels = await page.locator('.jxgbox .JXGtext').allTextContents();
    assert(
      !labels.some((text) => /^\(.*,.*\)$/.test(text.trim())),
      'intersection coordinates should default to hidden',
    );
  } catch (error) {
    recordError(error);
  } finally {
    await context.close();
  }
}

async function runPerpendicularTools() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  attachWatch(page, 'perpendicular');
  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /y = x²/ }).click();
    await page.waitForTimeout(400);
    await markPointAt(page, 1, 1);
    await createPerpendicular(page, 'A', 'x 轴');
    assert.equal(await page.locator('.perpendicular-card').count(), 1, 'perpendicular card missing');
    assert(
      (await page.locator('.marked-point-card').filter({ hasText: '垂足' }).count()) === 1,
      'perpendicular foot was not registered as a marked point',
    );
    const card = page.locator('.perpendicular-card').first();
    if ((await card.locator('.card-body').count()) === 0) {
      await card.locator('.card-title-button').click();
      await page.waitForTimeout(250);
    }
    assert(!(await card.getByRole('switch', { name: '显示垂足坐标' }).isChecked()));
    assert(!(await card.getByRole('switch', { name: '记录垂足轨迹' }).isChecked()));
    await card.getByRole('switch', { name: '显示垂足坐标' }).click();
    await page.waitForTimeout(350);
    assert(
      (await page.locator('.jxgbox .JXGtext').allTextContents()).some((text) =>
        /^\(.*, 0\)$/.test(text.trim()),
      ),
      'perpendicular foot coordinates were not shown',
    );
    const beforeTrace = await tracePixelCount(page);
    await card.getByRole('switch', { name: '记录垂足轨迹' }).click();
    const start = await screenFor(page, 1, 1);
    const end = await screenFor(page, 2, 4);
    await page.mouse.move(start.left, start.top);
    await page.mouse.down();
    await page.mouse.move(end.left, end.top, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    assert((await tracePixelCount(page)) > beforeTrace, 'perpendicular foot trace missing');
    await page.screenshot({ path: `${ARTIFACTS}/desktop-2d-perpendicular.png` });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.perpendicular-card').count(), 1, 'perpendicular did not persist');
    assert(
      (await page.locator('.marked-point-card').filter({ hasText: '垂足' }).count()) === 1,
      'perpendicular foot did not persist',
    );
  } catch (error) {
    recordError(error);
  } finally {
    await context.close();
  }
}

async function runPointTools() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  attachWatch(page, 'point-tools');
  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /y = x²/ }).click();
    await page.waitForTimeout(400);

    await page.locator('.objects-panel-head .secondary-small-button').filter({ hasText: '标点' }).click();
    let screen = await screenFor(page, 3, 3);
    await page.mouse.click(screen.left, screen.top);
    await page.waitForTimeout(400);
    assert((await page.locator('.point-confirm-card').innerText()).includes('曲线外点'));
    await page.locator('.point-confirm-card').getByRole('button', { name: '标记' }).click();
    await page.waitForTimeout(600);
    assert((await page.locator('.marked-point-card').first().innerText()).includes('自由点 A'));

    await page.locator('.objects-panel-head .secondary-small-button').filter({ hasText: '标点' }).click();
    screen = await screenFor(page, 1, 1);
    await page.mouse.click(screen.left, screen.top);
    await page.waitForTimeout(400);
    await page.locator('.point-confirm-card').getByRole('button', { name: '标记' }).click();
    await page.waitForTimeout(600);
    const curveCard = page.locator('.marked-point-card').nth(1);
    if ((await curveCard.locator('.card-body').count()) === 0) {
      await curveCard.locator('.card-title-button').click();
      await page.waitForTimeout(250);
    }
    await curveCard.locator('select[aria-label="选择坐标限制"]').selectOption('x');
    await page.waitForTimeout(300);
    const lockField = curveCard.locator('.inline-number .number-field');
    await lockField.fill('1.5');
    await lockField.blur();
    await page.waitForTimeout(700);
    assert((await curveCard.innerText()).includes('（1.5, 2.25）'));
  } catch (error) {
    recordError(error);
  } finally {
    await context.close();
  }
}

async function runResilience() {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  attachWatch(page, 'resilience');
  try {
    await page.addInitScript(() => {
      window.localStorage.setItem('jiantu.mathplot.v1', '{broken json');
    });
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    assert((await page.getByText('简图').count()) > 0);
    assert((await page.getByText('从一个表达式开始').count()) > 0);
  } catch (error) {
    recordError(error);
  } finally {
    await context.close();
  }

  const structured = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const structuredPage = await structured.newPage();
  attachWatch(structuredPage, 'structured-storage');
  try {
    await structuredPage.addInitScript(() => {
      window.localStorage.setItem(
        'jiantu.mathplot.v1',
        JSON.stringify({
          version: 1,
          mode: '2d',
          items2d: [{ id: 'bad', kind: 'explicit', expr: 7 }],
          items3d: 'not-an-array',
          geometry: [{ id: 'old', kind: 'circle' }],
          intersections: [],
          tangentIntersections: [{}],
          tangentAngleConstraints: [{}],
          paramValues: { a: '2' },
          view2dBoundingBox: [1, 2, 'oops', 4],
          snapToGrid: true,
        }),
      );
    });
    await structuredPage.goto(APP_URL, { waitUntil: 'networkidle' });
    await structuredPage.waitForTimeout(600);
    assert((await structuredPage.getByText('简图').count()) > 0);
  } catch (error) {
    recordError(error);
  } finally {
    await structured.close();
  }
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});

try {
  await runDesktop();
  await runMobile();
  await runUnifiedTools();
  await runCoincidentPoints();
  await runPerpendicularTools();
  await runPointTools();
  await runResilience();
} finally {
  await browser.close();
}

if (consoleErrors.length > 0) {
  failures.push(...consoleErrors.map((error) => `console/network: ${error}`));
}

console.log(`\nE2E summary: ${failures.length === 0 ? 'PASS' : `${failures.length} failure(s)`}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
