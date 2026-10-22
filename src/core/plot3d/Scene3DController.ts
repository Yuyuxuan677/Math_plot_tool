import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Item3D } from '../../app/types';
import { analyze3DItem } from '../plot2d/analysis';
import { buildImplicitSurfaceGeometry } from './implicitSurface';

export interface Scene3DCallbacks {
  onError: (message: string) => void;
}

type NumericScope = Record<string, number>;

function parseParamValues(paramValues: Record<string, string>): NumericScope {
  const scope: NumericScope = {};
  for (const [name, raw] of Object.entries(paramValues)) {
    const value = Number(raw);
    scope[name] = Number.isFinite(value) ? value : NaN;
  }
  return scope;
}

function scopeWith(base: NumericScope, params: NumericScope): NumericScope {
  return { ...params, ...base };
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function niceStep(range: number): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const raw = range / 6;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * power;
}

function formatTick(value: number): string {
  if (Math.abs(value) < 1e-10) return '0';
  const abs = Math.abs(value);
  if (abs >= 10000 || abs < 0.01) return value.toExponential(1);
  return Number(value.toFixed(abs < 1 ? 2 : 1)).toString();
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}

interface BuiltObject {
  group: THREE.Group;
  bounds: THREE.Box3;
}

interface BuildContext {
  items: Item3D[];
  params: NumericScope;
  mobile: boolean;
}

interface SceneBuildResult {
  objects: THREE.Group;
  bounds: THREE.Box3;
  lineMaterials: LineMaterial[];
  labelTextures: THREE.Texture[];
  objectCount: number;
}

export class Scene3DController {
  private readonly container: HTMLElement;
  private readonly callbacks: Scene3DCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private objectsGroup: THREE.Group | null = null;
  private axesGroup: THREE.Group | null = null;
  private lineMaterials: LineMaterial[] = [];
  private labelTextures: THREE.Texture[] = [];
  private bounds = new THREE.Box3(new THREE.Vector3(-5, -5, -5), new THREE.Vector3(5, 5, 5));
  private fitted = false;
  private lastObjectCount = 0;
  private lastBoundsKey = '';
  private disposed = false;
  private renderQueued = false;
  private resizeQueued = false;

  constructor(container: HTMLElement, callbacks: Scene3DCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 5000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(14, -16, 12);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 0.9;
    this.controls.target.set(0, 0, 0);
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.addEventListener('change', () => this.requestRender());

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xdce6f2, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
    keyLight.position.set(6, -8, 12);
    this.scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xcfd9ff, 1.1);
    fillLight.position.set(-8, 6, 4);
    this.scene.add(fillLight);

    this.resize();
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeQueued = true;
      window.requestAnimationFrame(() => {
        if (this.disposed || !this.resizeQueued) return;
        this.resizeQueued = false;
        this.resize();
      });
    });
    this.resizeObserver.observe(container);
    this.requestRender();
    if (import.meta.env.DEV) {
      (window as unknown as { __scene3d?: Scene3DController }).__scene3d = this;
    }
  }

  getDebugInfo(): Record<string, unknown> {
    return {
      bounds: {
        min: this.bounds.min.toArray(),
        max: this.bounds.max.toArray(),
      },
      camera: {
        position: this.camera.position.toArray(),
        aspect: this.camera.aspect,
        fov: this.camera.fov,
        near: this.camera.near,
        far: this.camera.far,
      },
      target: this.controls.target.toArray(),
      fitted: this.fitted,
    };
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const pixelRatio = this.renderer.getPixelRatio();
    for (const material of this.lineMaterials) {
      material.resolution.set(width * pixelRatio, height * pixelRatio);
    }
    this.requestRender();
  }

  private requestRender(): void {
    if (this.disposed || this.renderQueued) return;
    this.renderQueued = true;
    window.requestAnimationFrame(() => {
      this.renderQueued = false;
      if (this.disposed) return;
      this.renderer.render(this.scene, this.camera);
    });
  }

  update(items: Item3D[], paramValues: Record<string, string>): void {
    if (this.disposed) return;
    try {
      const defaults = new Set<string>();
      for (const item of items) {
        if (!item.visible) continue;
        for (const param of analyze3DItem(item).params) defaults.add(param);
      }
      const mergedParams: Record<string, string> = { ...paramValues };
      for (const name of defaults) {
        if (!(name in mergedParams)) mergedParams[name] = '1';
      }
      const context: BuildContext = {
        items,
        params: parseParamValues(mergedParams),
        mobile: window.innerWidth < 700,
      };
      const result = this.buildScene(context);
      this.objectsGroup = result.objects;
      this.scene.add(this.objectsGroup);
      this.bounds = result.bounds;
      this.lineMaterials = result.lineMaterials;
      this.labelTextures = result.labelTextures;
      this.buildAxes(this.bounds);
      const boundsKey = [
        this.bounds.min.x,
        this.bounds.min.y,
        this.bounds.min.z,
        this.bounds.max.x,
        this.bounds.max.y,
        this.bounds.max.z,
      ]
        .map((value) => value.toFixed(2))
        .join(',');
      const shouldFit =
        !this.fitted ||
        result.objectCount !== this.lastObjectCount ||
        boundsKey !== this.lastBoundsKey;
      this.lastObjectCount = result.objectCount;
      this.lastBoundsKey = boundsKey;
      if (shouldFit) {
        const preserveOrientation = this.fitted;
        this.fitted = true;
        this.fitCamera(!preserveOrientation);
      }
      this.resize();
      this.requestRender();
    } catch (error) {
      console.error('3D scene update failed', error);
      this.callbacks.onError('3D 场景更新失败，请检查表达式是否过于复杂');
    }
  }

  private clearSceneContents(): void {
    if (this.objectsGroup) {
      this.scene.remove(this.objectsGroup);
      disposeObject(this.objectsGroup);
      this.objectsGroup = null;
    }
    if (this.axesGroup) {
      this.scene.remove(this.axesGroup);
      disposeObject(this.axesGroup);
      this.axesGroup = null;
    }
    for (const texture of this.labelTextures) texture.dispose();
    this.labelTextures = [];
  }

  private buildScene(context: BuildContext): SceneBuildResult {
    this.clearSceneContents();
    const objects = new THREE.Group();
    objects.name = 'objects';
    const lineMaterials: LineMaterial[] = [];
    const labelTextures: THREE.Texture[] = [];
    const bounds = new THREE.Box3();
    let hasBounds = false;
    let objectCount = 0;

    for (const item of context.items) {
      if (!item.visible) continue;
      const analysis = analyze3DItem(item);
      if (analysis.errors.length > 0) continue;
      try {
        const built = this.buildItem(item, analysis, context);
        if (!built) continue;
        objects.add(built.group);
        objectCount += 1;
        if (built.bounds.isEmpty()) continue;
        if (!hasBounds) {
          bounds.copy(built.bounds);
          hasBounds = true;
        } else {
          bounds.union(built.bounds);
        }
        built.group.traverse((child) => {
          const line = child as unknown as { material?: THREE.Material };
          if (line.material instanceof LineMaterial) {
            lineMaterials.push(line.material);
          }
        });
      } catch (error) {
        console.error('3D object build failed', error);
        this.callbacks.onError('有一个 3D 对象无法绘制，已跳过');
      }
    }

    if (!hasBounds) {
      bounds.set(new THREE.Vector3(-5, -5, -5), new THREE.Vector3(5, 5, 5));
    } else {
      const size = bounds.getSize(new THREE.Vector3());
      const pad = Math.max(1, Math.max(size.x, size.y, size.z) * 0.08);
      bounds.expandByScalar(pad);
      if (size.z < 1e-6) {
        bounds.min.z -= 1;
        bounds.max.z += 1;
      }
    }

    return { objects, bounds, lineMaterials, labelTextures, objectCount };
  }

  private evalField(
    fields: ReturnType<typeof analyze3DItem>['fields'],
    field: string,
    base: NumericScope,
    params: NumericScope,
  ): number {
    const entry = fields.find((candidate) => candidate.field === field);
    if (!entry || !entry.analysis.ok) return NaN;
    try {
      return entry.analysis.evaluate(scopeWith(base, params));
    } catch {
      return NaN;
    }
  }

  private buildItem(
    item: Item3D,
    analysis: ReturnType<typeof analyze3DItem>,
    context: BuildContext,
  ): BuiltObject | null {
    if (item.kind === 'surface' || item.kind === 'paramSurface') {
      return this.buildSurface(item, analysis, context);
    }
    if (item.kind === 'implicit3d') {
      return this.buildImplicitSurface(item, analysis, context);
    }
    return this.buildCurve(item, analysis, context);
  }

  private buildImplicitSurface(
    item: Extract<Item3D, { kind: 'implicit3d' }>,
    analysis: ReturnType<typeof analyze3DItem>,
    context: BuildContext,
  ): BuiltObject | null {
    const geometry = buildImplicitSurfaceGeometry({
      field: (x, y, z) =>
        this.evalField(analysis.fields, 'expr', { x, y, z }, context.params),
      xMin: item.xMin,
      xMax: item.xMax,
      yMin: item.yMin,
      yMax: item.yMax,
      zMin: item.zMin,
      zMax: item.zMax,
      resolution: item.resolution,
    });
    if (!geometry) return null;
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox?.clone() ?? new THREE.Box3();
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(item.color),
      side: THREE.DoubleSide,
      roughness: 0.56,
      metalness: 0.03,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = item.id;
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
    });
    const wireMesh = new THREE.Mesh(geometry, wireMaterial);
    wireMesh.renderOrder = 2;
    const group = new THREE.Group();
    group.name = item.id;
    group.add(mesh);
    group.add(wireMesh);
    return { group, bounds };
  }

  private buildSurface(
    item: Extract<Item3D, { kind: 'surface' | 'paramSurface' }>,
    analysis: ReturnType<typeof analyze3DItem>,
    context: BuildContext,
  ): BuiltObject | null {
    const targetSegments = clamp(
      Math.round(Number(item.resolution) || 48),
      12,
      context.mobile ? 48 : 96,
    );
    const cols = targetSegments + 1;
    const rows = targetSegments + 1;
    const positions: number[] = [];
    const indices: number[] = [];
    const valid: boolean[] = [];
    const bounds = new THREE.Box3();
    let hasPoint = false;

    for (let iy = 0; iy < rows; iy += 1) {
      for (let ix = 0; ix < cols; ix += 1) {
        const fx = ix / targetSegments;
        const fy = iy / targetSegments;
        let x: number;
        let y: number;
        let z: number;
        if (item.kind === 'surface') {
          x = item.xMin + (item.xMax - item.xMin) * fx;
          y = item.yMin + (item.yMax - item.yMin) * fy;
          z = this.evalField(
            analysis.fields,
            'expr',
            { x, y },
            context.params,
          );
        } else {
          const u = item.uMin + (item.uMax - item.uMin) * fx;
          const v = item.vMin + (item.vMax - item.vMin) * fy;
          x = this.evalField(analysis.fields, 'xExpr', { u, v }, context.params);
          y = this.evalField(analysis.fields, 'yExpr', { u, v }, context.params);
          z = this.evalField(analysis.fields, 'zExpr', { u, v }, context.params);
        }
        const ok = finite(x) && finite(y) && finite(z) && Math.abs(z) <= 1e5;
        valid.push(ok);
        positions.push(ok ? x : 0, ok ? y : 0, ok ? z : 0);
        if (ok) {
          bounds.expandByPoint(new THREE.Vector3(x, y, z));
          hasPoint = true;
        }
      }
    }

    for (let iy = 0; iy < targetSegments; iy += 1) {
      for (let ix = 0; ix < targetSegments; ix += 1) {
        const a = iy * cols + ix;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        if (valid[a] && valid[b] && valid[c] && valid[d]) {
          indices.push(a, b, c, b, d, c);
        }
      }
    }

    if (!hasPoint || indices.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(item.color),
      side: THREE.DoubleSide,
      roughness: 0.58,
      metalness: 0.03,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = item.id;
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
    });
    const wireMesh = new THREE.Mesh(geometry, wireMaterial);
    wireMesh.renderOrder = 2;
    const group = new THREE.Group();
    group.add(mesh);
    group.add(wireMesh);
    return { group, bounds };
  }

  private buildCurve(
    item: Extract<Item3D, { kind: 'curve3d' }>,
    analysis: ReturnType<typeof analyze3DItem>,
    context: BuildContext,
  ): BuiltObject | null {
    const samples = clamp(
      Math.round(Number(item.resolution) || 700),
      80,
      context.mobile ? 1200 : 2000,
    );
    const bounds = new THREE.Box3();
    const runs: THREE.Vector3[][] = [];
    let current: THREE.Vector3[] = [];

    for (let index = 0; index <= samples; index += 1) {
      const t = item.tMin + ((item.tMax - item.tMin) * index) / samples;
      const x = this.evalField(analysis.fields, 'xExpr', { t }, context.params);
      const y = this.evalField(analysis.fields, 'yExpr', { t }, context.params);
      const z = this.evalField(analysis.fields, 'zExpr', { t }, context.params);
      if (finite(x) && finite(y) && finite(z) && Math.abs(z) <= 1e5) {
        const point = new THREE.Vector3(x, y, z);
        current.push(point);
        bounds.expandByPoint(point);
      } else if (current.length > 0) {
        if (current.length >= 2) runs.push(current);
        current = [];
      }
    }
    if (current.length >= 2) runs.push(current);
    if (runs.length === 0) return null;

    const group = new THREE.Group();
    group.name = item.id;
    const material = new LineMaterial({
      color: new THREE.Color(item.color).getHex(),
      linewidth: 2.6,
      transparent: false,
      dashed: false,
    });
    material.resolution.set(
      Math.max(1, this.container.clientWidth) * this.renderer.getPixelRatio(),
      Math.max(1, this.container.clientHeight) * this.renderer.getPixelRatio(),
    );
    for (const run of runs) {
      const positions: number[] = [];
      for (const point of run) positions.push(point.x, point.y, point.z);
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      const line = new Line2(geometry, material);
      line.computeLineDistances();
      line.frustumCulled = false;
      group.add(line);
    }
    return { group, bounds };
  }

  private makeLabel(text: string, color: string, size: number): {
    sprite: THREE.Sprite;
    texture: THREE.Texture;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 40px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(size * 2, size, 1);
    sprite.renderOrder = 20;
    return { sprite, texture };
  }

  private buildAxes(bounds: THREE.Box3): void {
    if (this.axesGroup) {
      this.scene.remove(this.axesGroup);
      disposeObject(this.axesGroup);
      this.axesGroup = null;
    }
    for (const texture of this.labelTextures) texture.dispose();
    this.labelTextures = [];

    const group = new THREE.Group();
    group.name = 'axes';
    const min = bounds.min.clone();
    const max = bounds.max.clone();
    const size = max.clone().sub(min);
    const extent = Math.max(1, size.x, size.y, size.z);
    const axisZ = clamp(0, min.z, max.z);
    const axisX = clamp(0, min.x, max.x);
    const axisY = clamp(0, min.y, max.y);

    const axisMaterial = new THREE.LineBasicMaterial({ color: 0x94a3b8 });
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0xe2e8f0 });
    const tickMaterial = new THREE.LineBasicMaterial({ color: 0xb8c4d4 });

    const addLine = (
      from: THREE.Vector3,
      to: THREE.Vector3,
      material: THREE.LineBasicMaterial,
    ) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(geometry, material);
      group.add(line);
    };

    // x/y axes on the base plane, z axis through the origin.
    addLine(
      new THREE.Vector3(min.x, axisY, axisZ),
      new THREE.Vector3(max.x, axisY, axisZ),
      axisMaterial,
    );
    addLine(
      new THREE.Vector3(axisX, min.y, axisZ),
      new THREE.Vector3(axisX, max.y, axisZ),
      axisMaterial,
    );
    addLine(
      new THREE.Vector3(axisX, axisY, min.z),
      new THREE.Vector3(axisX, axisY, max.z),
      axisMaterial,
    );

    // Base grid.
    const xStep = niceStep(size.x);
    const yStep = niceStep(size.y);
    const gridPositions: THREE.Vector3[] = [];
    for (let x = Math.ceil(min.x / xStep) * xStep; x <= max.x + xStep * 0.01; x += xStep) {
      gridPositions.push(new THREE.Vector3(x, min.y, axisZ), new THREE.Vector3(x, max.y, axisZ));
    }
    for (let y = Math.ceil(min.y / yStep) * yStep; y <= max.y + yStep * 0.01; y += yStep) {
      gridPositions.push(new THREE.Vector3(min.x, y, axisZ), new THREE.Vector3(max.x, y, axisZ));
    }
    if (gridPositions.length >= 2) {
      const geometry = new THREE.BufferGeometry().setFromPoints(gridPositions);
      group.add(new THREE.LineSegments(geometry, gridMaterial));
    }

    // Ticks and labels.
    const labelSize = extent * 0.06;
    const tickLength = extent * 0.018;
    const labelOffset = extent * 0.06;

    const addTick = (
      point: THREE.Vector3,
      direction: THREE.Vector3,
      label: string,
    ) => {
      addLine(
        point.clone().sub(direction.clone().multiplyScalar(tickLength)),
        point.clone().add(direction.clone().multiplyScalar(tickLength)),
        tickMaterial,
      );
      const labelPoint = point
        .clone()
        .add(direction.clone().multiplyScalar(labelOffset));
      const { sprite, texture } = this.makeLabel(label, '#64748b', labelSize);
      sprite.position.copy(labelPoint);
      group.add(sprite);
      this.labelTextures.push(texture);
    };

    const xTicks = [];
    for (let x = Math.ceil(min.x / xStep) * xStep; x <= max.x + xStep * 0.01; x += xStep) {
      if (Math.abs(x) < xStep * 0.01) continue;
      xTicks.push(x);
    }
    xTicks.forEach((x, index) => {
      if (index % 2 !== 0 && xTicks.length > 4) return;
      addTick(
        new THREE.Vector3(x, axisY, axisZ),
        new THREE.Vector3(0, 1, 0),
        formatTick(x),
      );
    });

    const yTicks = [];
    for (let y = Math.ceil(min.y / yStep) * yStep; y <= max.y + yStep * 0.01; y += yStep) {
      if (Math.abs(y) < yStep * 0.01) continue;
      yTicks.push(y);
    }
    yTicks.forEach((y, index) => {
      if (index % 2 !== 0 && yTicks.length > 4) return;
      addTick(
        new THREE.Vector3(axisX, y, axisZ),
        new THREE.Vector3(1, 0, 0),
        formatTick(y),
      );
    });

    const zStep = niceStep(size.z);
    const zTicks = [];
    for (let z = Math.ceil(min.z / zStep) * zStep; z <= max.z + zStep * 0.01; z += zStep) {
      if (Math.abs(z) < zStep * 0.01) continue;
      zTicks.push(z);
    }
    zTicks.forEach((z, index) => {
      if (index % 2 !== 0 && zTicks.length > 4) return;
      addTick(
        new THREE.Vector3(axisX, axisY, z),
        new THREE.Vector3(1, 0, 0),
        formatTick(z),
      );
    });

    const labels = [
      { text: 'x', position: new THREE.Vector3(max.x + labelOffset * 1.4, axisY, axisZ) },
      { text: 'y', position: new THREE.Vector3(axisX, max.y + labelOffset * 1.4, axisZ) },
      { text: 'z', position: new THREE.Vector3(axisX, axisY, max.z + labelOffset * 1.4) },
    ];
    for (const label of labels) {
      const { sprite, texture } = this.makeLabel(label.text, '#475569', labelSize * 1.35);
      sprite.position.copy(label.position);
      group.add(sprite);
      this.labelTextures.push(texture);
    }

    this.axesGroup = group;
    this.scene.add(group);
  }

  resetView(): void {
    this.fitted = true;
    this.fitCamera(true);
    this.requestRender();
  }

  private fitCamera(useDefaultOrientation: boolean): void {
    const center = this.bounds.getCenter(new THREE.Vector3());
    const size = this.bounds.getSize(new THREE.Vector3());
    const radius = Math.max(2, size.length() / 2);
    const distance = radius / Math.sin((this.camera.fov * Math.PI) / 360);
    let direction: THREE.Vector3;
    if (useDefaultOrientation) {
      direction = new THREE.Vector3(1.0, -1.5, 1.2).normalize();
    } else {
      direction = this.camera.position.clone().sub(this.controls.target);
      if (direction.lengthSq() < 1e-8) {
        direction = new THREE.Vector3(1.0, -1.5, 1.2);
      }
      direction.normalize();
    }
    this.camera.position.copy(center).add(direction.multiplyScalar(distance * 1.25));
    this.camera.near = Math.max(0.01, distance / 1000);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(center);
    this.controls.minDistance = Math.max(0.2, distance * 0.12);
    this.controls.maxDistance = distance * 8;
    this.controls.update();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.resizeObserver.disconnect();
      this.controls.dispose();
      this.clearSceneContents();
      this.renderer.dispose();
      this.renderer.domElement.remove();
    } catch {
      // ignore teardown errors
    }
  }
}
