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
        console.error(`[network] external request ${url}`);
      }
    } catch {
      // ignore malformed URLs
    }
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function boardPoint(page, fx, fy) {
  const box = await page.locator('.jxgbox').boundingBox();
  assert(box, '2D board is not rendered');
  return {
    x: box.x + box.width * fx,
    y: box.y + box.height * fy,
    box,
  };
}

async function drawWithTool(page, toolLabel, points, options = {}) {
  if (options.mobile) {
    await page.locator('.sheet-quick-button').filter({ hasText: '画图' }).click();
  } else {
    await page.locator('.objects-panel-head .secondary-small-button').click();
  }
  await page.locator('.tool-tray').getByRole('button', { name: toolLabel, exact: true }).click();
  await page.waitForTimeout(250);
  for (const [fx, fy] of points) {
    const point = await boardPoint(page, fx, fy);
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(280);
  }
  await page.waitForTimeout(600);
}

async function addOption(page, text) {
  if ((await page.locator('.objects-panel-head').count()) > 0) {
    await page.locator('.objects-panel-head .primary-small-button').click();
  } else {
    await page.locator('.sheet-quick-button').filter({ hasText: '添加' }).click();
  }
  await page.waitForTimeout(180);
  await page.locator('.action-option').filter({ hasText: text }).first().click();
  await page.waitForTimeout(700);
}

async function selectDriver(page, card, matchText) {
  const select = card.locator('select[aria-label="选择动点所在的曲线"]');
  await select.waitFor({ state: 'visible', timeout: 5000 });
  const options = await select.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => ({ value: node.value, text: node.textContent ?? '' })),
  );
  const option = options.find((entry) => entry.text.includes(matchText));
  assert(option, `driver option containing "${matchText}" not found`);
  await select.selectOption(option.value);
  await page.waitForTimeout(500);
}

async function runDesktop() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  attachWatch(page, 'desktop');
  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    assert.equal(await page.title(), '简图 · 数学画板');
    await page.locator('.jxgbox svg').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /y = x²/ }).click();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.object-card').count(), 1, 'function card was not added');
    assert((await page.locator('.jxgbox svg path').count()) > 0, 'function graph did not render');

    const expr = page.locator('.object-card .expression-input').first();
    await expr.fill('a*x^2');
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.parameter-row').count(), 1, 'parameter slider missing');
    const paramInput = page.locator('.parameter-input').first();
    await paramInput.fill('2');
    await page.waitForTimeout(500);
    assert.equal(await paramInput.inputValue(), '2');

    const derivativeSwitch = page.getByRole('switch', { name: '显示导函数' });
    await derivativeSwitch.click();
    await page.waitForTimeout(500);
    assert((await page.locator('.derivative-box .katex').count()) > 0, 'derivative formula missing');
    const visibleBlueDashes = () =>
      page.evaluate(() => {
        const paths = [...document.querySelectorAll('.jxgbox svg path')];
        return paths.filter((path) => {
          const style = getComputedStyle(path);
          return (
            style.stroke === 'rgb(37, 99, 235)' &&
            style.strokeDasharray !== 'none' &&
            style.visibility !== 'hidden' &&
            style.display !== 'none'
          );
        }).length;
      });
    assert((await visibleBlueDashes()) > 0, 'derivative curve was not drawn');
    await derivativeSwitch.click();
    await page.waitForTimeout(600);
    assert.equal(await visibleBlueDashes(), 0, 'derivative curve stayed visible after toggling off');

    const addTangentButton = page.getByRole('button', { name: /添加切线/ });
    await addTangentButton.click();
    await page.waitForTimeout(500);
    await addTangentButton.click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.tangent-row').count(), 2, 'multiple tangents were not added');
    await page.screenshot({ path: `${ARTIFACTS}/desktop-2d-expressions.png` });

    const expressionCard = page.locator('.object-card:not(.geometry-card)').first();
    const visibleCurvePaths = () =>
      page.evaluate(() => {
        const paths = [...document.querySelectorAll('.jxgbox svg path')];
        return paths.filter((path) => {
          const style = getComputedStyle(path);
          return (
            (style.stroke === 'rgb(37, 99, 235)' || style.stroke === 'rgb(217, 119, 6)') &&
            style.visibility !== 'hidden' &&
            style.display !== 'none'
          );
        }).length;
      });
    assert((await visibleCurvePaths()) > 0, 'function or tangents were not visible');
    await expressionCard.getByRole('button', { name: '隐藏' }).click();
    await page.waitForTimeout(600);
    assert.equal(
      await visibleCurvePaths(),
      0,
      'hiding an expression left its curve or tangents visible',
    );
    await expressionCard.getByRole('button', { name: '显示' }).click();
    await page.waitForTimeout(600);
    assert((await visibleCurvePaths()) > 0, 'showing an expression did not restore its curve');

    await expr.fill('sin(');
    await page.waitForTimeout(500);
    assert((await page.locator('.field-error').count()) > 0, 'invalid expression did not show an error');
    assert.equal(await page.locator('.object-card').count(), 1, 'invalid expression crashed the card list');
    await expr.fill('a*x^2 + b*x + c + d');
    await page.waitForTimeout(500);
    assert(
      (await page.locator('.field-error').allInnerTexts()).some((text) =>
        text.includes('最多支持 3 个参数'),
      ),
      '4th parameter was not rejected',
    );
    await expr.fill('a*x^2');
    await page.waitForTimeout(500);

    await addOption(page, '隐式方程');
    assert.equal(await page.locator('.object-card').count(), 2, 'implicit card was not added');
    const implicitCard = page.locator('.object-card').filter({ hasText: '隐式方程' }).last();
    await implicitCard.getByRole('button', { name: /添加切线/ }).click();
    await page.waitForTimeout(500);
    await implicitCard.getByRole('button', { name: /添加切线/ }).click();
    await page.waitForTimeout(700);
    assert.equal(
      await implicitCard.locator('.tangent-row').count(),
      2,
      'implicit curve tangents failed',
    );

    await addOption(page, '参数曲线');
    assert.equal(await page.locator('.object-card').count(), 3, 'param curve card was not added');
    await page.screenshot({ path: `${ARTIFACTS}/desktop-2d-all-types.png` });

    await drawWithTool(page, '圆', [
      [0.38, 0.38],
      [0.52, 0.38],
    ]);
    assert.equal(await page.locator('.geometry-card').count(), 1, 'circle was not created');
    const circleCard = page.locator('.geometry-card').filter({ hasText: '圆' }).first();
    if ((await circleCard.locator('.card-body').count()) === 0) {
      await circleCard.locator('.card-title-button').click();
    }
    await circleCard.getByRole('switch', { name: '显示方程' }).click();
    await page.waitForTimeout(500);
    assert(
      (await circleCard.locator('.equation-preview .katex').count()) > 0,
      'circle equation preview missing',
    );
    await circleCard.getByRole('button', { name: /添加切线/ }).click();
    await page.waitForTimeout(500);
    await circleCard.getByRole('button', { name: /添加切线/ }).click();
    await page.waitForTimeout(500);
    assert.equal(
      await circleCard.locator('.tangent-row').count(),
      2,
      'circle multiple tangents failed',
    );

    await drawWithTool(page, '直线', [
      [0.22, 0.7],
      [0.5, 0.7],
    ]);
    assert.equal(await page.locator('.geometry-card').count(), 2, 'line was not created');
    const lineCard = page.locator('.geometry-card').filter({ hasText: '直线' }).last();
    if ((await lineCard.locator('.card-body').count()) === 0) {
      await lineCard.locator('.card-title-button').click();
    }
    const nField = lineCard.getByLabel('等分点数量 n');
    await nField.fill('5');
    await nField.blur();
    await page.waitForTimeout(700);
    assert(
      (await lineCard.innerText()).includes('等分点已隐藏'),
      'division markers should be hidden by default',
    );
    await lineCard.getByRole('switch', { name: '显示等分点' }).click();
    await page.waitForTimeout(700);
    assert(
      (await lineCard.innerText()).includes('4 个等分点'),
      'division count did not update after showing markers',
    );

    await selectDriver(page, lineCard, '圆');
    const traceSwitch = lineCard.getByRole('switch', { name: '记录等分点轨迹' });
    await traceSwitch.click();
    await page.waitForTimeout(300);
    const playButton = lineCard.getByRole('button', { name: '播放' });
    if ((await playButton.count()) > 0) {
      await playButton.click();
      await page.waitForTimeout(700);
      const pauseButton = lineCard.getByRole('button', { name: '暂停' });
      if ((await pauseButton.count()) > 0) {
        await pauseButton.click();
      }
    }
    await page.waitForTimeout(300);

    const locusButton = lineCard.getByRole('button', { name: '推导轨迹方程' });
    await locusButton.waitFor({ state: 'visible' });
    assert.equal(await locusButton.isDisabled(), false, 'locus equation button is disabled');
    await locusButton.click();
    await page.waitForTimeout(700);
    await page.locator('.locus-dialog').waitFor({ state: 'visible' });
    assert((await page.locator('.locus-dialog .katex').count()) > 0, 'locus equation missing');
    assert(
      (await page.locator('.locus-step').count()) >= 3,
      'locus derivation steps missing',
    );
    await page.screenshot({ path: `${ARTIFACTS}/desktop-2d-locus.png` });
    await page.getByRole('button', { name: '关闭轨迹方程' }).click();
    await page.waitForTimeout(400);

    await page.screenshot({ path: `${ARTIFACTS}/desktop-2d-geometry.png` });

    await page.waitForTimeout(700);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    assert.equal(await page.locator('.object-card:not(.geometry-card)').count(), 3, '2D objects did not persist');
    assert.equal(await page.locator('.geometry-card').count(), 2, 'geometry did not persist');

    await page.getByRole('tab', { name: /3D 空间/ }).click();
    await page.waitForTimeout(1800);
    await page.locator('.scene3d-canvas canvas').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /波浪面/ }).click();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.object-card').count(), 1, '3D surface card missing');
    await addOption(page, '空间曲线');
    assert.equal(await page.locator('.object-card').count(), 2, '3D curve card missing');
    const sceneBox = await page.locator('.scene3d-canvas').boundingBox();
    assert(sceneBox, '3D canvas missing');
    await page.mouse.move(sceneBox.x + sceneBox.width * 0.55, sceneBox.y + sceneBox.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(sceneBox.x + sceneBox.width * 0.7, sceneBox.y + sceneBox.height * 0.55, {
      steps: 8,
    });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${ARTIFACTS}/desktop-3d.png` });
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
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, 'mobile layout has horizontal overflow');
    const quickHeight = await page.locator('.sheet-quick-button').first().evaluate((el) => el.getBoundingClientRect().height);
    assert(quickHeight >= 44, 'mobile quick action is smaller than 44px');
    await page.getByRole('button', { name: /y = x²/ }).click();
    await page.waitForTimeout(500);
    await page.locator('.sheet-title').click();
    await page.waitForTimeout(400);
    const expr = page.locator('.object-card .expression-input').first();
    await expr.fill('sin(x)');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${ARTIFACTS}/mobile-2d-edit.png` });
    await page.locator('.sheet-title').click();
    await page.waitForTimeout(400);

    await page.locator('.sheet-quick-button').filter({ hasText: '画图' }).click();
    await page.locator('.tool-tray').getByRole('button', { name: '圆', exact: true }).click();
    await page.waitForTimeout(300);
    const box = await page.locator('.jxgbox').boundingBox();
    assert(box, 'mobile board missing');
    await page.touchscreen.tap(box.x + box.width * 0.4, box.y + box.height * 0.3);
    await page.waitForTimeout(300);
    await page.touchscreen.tap(box.x + box.width * 0.7, box.y + box.height * 0.3);
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.geometry-card').count(), 1, 'mobile circle was not created');
    await page.screenshot({ path: `${ARTIFACTS}/mobile-2d-circle.png` });

    await page.locator('.sheet-quick-button').filter({ hasText: '添加' }).click();
    await page.waitForTimeout(200);
    await page.locator('.action-option').filter({ hasText: '隐式方程' }).click();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('.object-card:not(.geometry-card)').count(), 2, 'mobile add menu failed');

    await page.getByRole('tab', { name: '空间' }).click();
    await page.waitForTimeout(1800);
    if ((await page.locator('.mobile-sheet.is-expanded').count()) > 0) {
      await page.locator('.sheet-title').click();
      await page.waitForTimeout(300);
    }
    await page.locator('.scene3d-canvas canvas').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: /球面/ }).click();
    await page.waitForTimeout(1200);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${ARTIFACTS}/mobile-3d.png` });
    const overflow3d = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow3d, false, 'mobile 3D layout has horizontal overflow');
  } catch (error) {
    recordError(error);
  } finally {
    await context.close();
  }

  const landscapeContext = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const landscapePage = await landscapeContext.newPage();
  attachWatch(landscapePage, 'landscape');
  try {
    await landscapePage.goto(APP_URL, { waitUntil: 'networkidle' });
    await landscapePage.waitForTimeout(500);
    await landscapePage.getByRole('button', { name: /y = x²/ }).click();
    await landscapePage.waitForTimeout(400);
    await landscapePage.locator('.sheet-title').click();
    await landscapePage.waitForTimeout(500);
    const sheetBox = await landscapePage.locator('.mobile-sheet').boundingBox();
    assert(sheetBox, 'landscape sheet missing');
    assert(sheetBox.width < 844 * 0.6, 'landscape expanded sheet should become a side panel');
    await landscapePage.screenshot({ path: `${ARTIFACTS}/mobile-landscape.png` });
  } catch (error) {
    recordError(error);
  } finally {
    await landscapeContext.close();
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
    assert((await page.getByText('简图').count()) > 0, 'app did not recover from malformed storage');
    assert(
      (await page.getByText('从一个表达式开始').count()) > 0,
      'empty state missing after malformed storage',
    );
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
          geometry: [{ id: 'bad-geometry', kind: 'circle' }],
          paramValues: { a: '2', bad: {} },
          view2dBoundingBox: [1, 2, 'oops', 4],
          snapToGrid: true,
        }),
      );
    });
    await structuredPage.goto(APP_URL, { waitUntil: 'networkidle' });
    await structuredPage.waitForTimeout(600);
    assert(
      (await structuredPage.getByText('简图').count()) > 0,
      'app did not recover from structured malformed storage',
    );
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
