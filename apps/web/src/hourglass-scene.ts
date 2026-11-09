import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type HourglassTheme = 'amber' | 'rose' | 'midnight';
export type HourglassMotion = 'gentle' | 'lively' | 'still';
export type HourglassOptions = { theme: HourglassTheme; motion: HourglassMotion; active: boolean };
const palettes = {
  amber: { metal: '#92734b', trim: '#dfb87b', sand: '#d4a568', glass: '#fff7e3', light: '#ffe7b5' },
  rose: { metal: '#a36e77', trim: '#edc1b9', sand: '#e5b2ac', glass: '#fff0f3', light: '#ffd4df' },
  midnight: {
    metal: '#586580',
    trim: '#adbce3',
    sand: '#c5d7f3',
    glass: '#e6edff',
    light: '#bbd4ff',
  },
};

/** Progress/material changes reuse the same meshes and GPU context. */
export function createHourglass(
  host: HTMLElement,
  progress: number,
  options: Partial<HourglassOptions> = {},
) {
  let settings: HourglassOptions = { theme: 'amber', motion: 'gentle', active: true, ...options };
  const renderer = new T.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.transmissionResolutionScale = 0.5;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(
      34,
      Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight),
      0.1,
      30,
    );
  camera.position.set(3.8, 2.1, 5.8);
  camera.lookAt(0, 0, 0);
  const pmrem = new T.PMREMGenerator(renderer),
    room = new RoomEnvironment(),
    environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  const group = new T.Group();
  group.rotation.z = -0.065;
  scene.add(group);
  const metal = new T.MeshStandardMaterial({ metalness: 0.7, roughness: 0.27 });
  const trim = new T.MeshStandardMaterial({ metalness: 0.45, roughness: 0.42 });
  const glass = new T.MeshPhysicalMaterial({
    color: '#fff9ee',
    roughness: 0.08,
    transmission: 1,
    thickness: 0.12,
    ior: 1.46,
    clearcoat: 1,
    side: T.DoubleSide,
    attenuationDistance: 2,
  });
  const sand = new T.MeshStandardMaterial({ roughness: 0.92, metalness: 0.04 });
  const mesh = (geometry: T.BufferGeometry, material: T.Material, y = 0) => {
    const item = new T.Mesh(geometry, material);
    item.position.y = y;
    group.add(item);
    return item;
  };
  for (const y of [-1.48, 1.48]) {
    mesh(new T.CylinderGeometry(0.86, 0.86, 0.13, 64), metal, y);
    mesh(new T.CylinderGeometry(0.73, 0.75, 0.07, 64), trim, y + (y < 0 ? 0.1 : -0.1));
    const ring = mesh(new T.TorusGeometry(0.8, 0.023, 10, 64), trim, y);
    ring.rotation.x = Math.PI / 2;
    const engraving = mesh(
      new T.TorusGeometry(0.66, 0.008, 6, 64),
      metal,
      y + (y < 0 ? 0.15 : -0.15),
    );
    engraving.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + 0.3;
    const post = mesh(new T.CylinderGeometry(0.03, 0.035, 2.83, 12), metal);
    post.position.set(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75);
    for (const y of [-1.22, 1.22]) {
      const bead = mesh(new T.SphereGeometry(0.047, 10, 8), trim, y);
      bead.position.x = post.position.x;
      bead.position.z = post.position.z;
    }
  }
  const profile = new T.CatmullRomCurve3([
    new T.Vector3(0.49, -1.35, 0),
    new T.Vector3(0.64, -1.12, 0),
    new T.Vector3(0.57, -0.72, 0),
    new T.Vector3(0.23, -0.23, 0),
    new T.Vector3(0.065, 0, 0),
    new T.Vector3(0.23, 0.23, 0),
    new T.Vector3(0.57, 0.72, 0),
    new T.Vector3(0.64, 1.12, 0),
    new T.Vector3(0.49, 1.35, 0),
  ])
    .getPoints(56)
    .map((p) => new T.Vector2(p.x, p.y));
  mesh(new T.LatheGeometry(profile, 56), glass);
  const lathe = (points: number[][]) =>
    new T.LatheGeometry(
      points.map(([x, y]) => new T.Vector2(x, y)),
      48,
    );
  const upperProfile = [
    [0.035, 0.04],
    [0.18, 0.23],
    [0.53, 0.72],
    [0.6, 1.12],
    [0.46, 1.29],
  ];
  const lowerProfile = upperProfile.map(([r, y]) => [r, -y]).reverse();
  // Equal sand volume is transferred between vessels; surfaces stay inside the glass.
  const fillGeometry = (profile: number[][], fraction: number) => {
    const samples: number[][] = [];
    for (let i = 0; i < profile.length - 1; i++) {
      const [r0, y0] = profile[i],
        [r1, y1] = profile[i + 1];
      for (let j = 0; j < 16; j++)
        samples.push([T.MathUtils.lerp(r0, r1, j / 16), T.MathUtils.lerp(y0, y1, j / 16)]);
    }
    samples.push(profile.at(-1)!);
    const volumes = [0];
    for (let i = 1; i < samples.length; i++) {
      const [r0, y0] = samples[i - 1],
        [r1, y1] = samples[i];
      volumes.push(volumes[i - 1] + ((y1 - y0) * (r0 * r0 + r0 * r1 + r1 * r1)) / 3);
    }
    const wanted = Math.max(0, Math.min(1, fraction)) * volumes.at(-1)!;
    const end = Math.max(
      1,
      volumes.findIndex((v) => v >= wanted),
    );
    const t = (wanted - volumes[end - 1]) / Math.max(0.000001, volumes[end] - volumes[end - 1]);
    const level = T.MathUtils.lerp(samples[end - 1][1], samples[end][1], t);
    const geometry = lathe([
      [0, samples[0][1]],
      ...samples.slice(0, end),
      [T.MathUtils.lerp(samples[end - 1][0], samples[end][0], t), level],
      [0, level],
    ]);
    geometry.computeBoundingBox();
    return geometry;
  };
  const bottom = mesh(fillGeometry(lowerProfile, progress), sand);
  const top = mesh(fillGeometry(upperProfile, 1 - progress), sand);
  const grainGeometry = new T.BufferGeometry();
  const grains = new Float32Array(96 * 3);
  const grainPositions = new T.BufferAttribute(grains, 3).setUsage(T.DynamicDrawUsage);
  grainGeometry.setAttribute('position', grainPositions);
  const grainMaterial = new T.PointsMaterial({
    color: '#ead0a1',
    size: 0.018,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const grainCloud = new T.Points(grainGeometry, grainMaterial);
  grainCloud.frustumCulled = false;
  group.add(grainCloud);
  const starGeometry = new T.BufferGeometry();
  const stars = new Float32Array(42 * 3);
  for (let i = 0; i < 42; i++) {
    const a = i * 2.399963,
      r = 0.95 + (i % 7) * 0.08;
    stars.set([Math.cos(a) * r, -1.4 + (i % 17) * 0.17, Math.sin(a) * r], i * 3);
  }
  starGeometry.setAttribute('position', new T.BufferAttribute(stars, 3));
  const starMaterial = new T.PointsMaterial({
    color: '#dfc18a',
    size: 0.026,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const starCloud = new T.Points(starGeometry, starMaterial);
  group.add(starCloud);
  const glow = new T.PointLight('#ffe1ac', 16, 10);
  glow.position.set(-2, 3, 3);
  scene.add(glow, new T.HemisphereLight('#fff9e6', '#8b7e73', 2));
  const floor = new T.Mesh(
    new T.CircleGeometry(1.12, 48),
    new T.MeshBasicMaterial({
      color: '#896e50',
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.6;
  scene.add(floor);
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Đồng hồ cát 3D của nhịp yêu thương');
  renderer.domElement.setAttribute('role', 'img');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = true,
    frame = 0,
    last = 0,
    disposed = false,
    orbit = 0,
    pointer = 0;
  let target = Math.max(0, Math.min(1, progress)),
    amount = target;
  let geometryAmount = -1,
    flowingUntil = 0;
  let blocked = !!document.querySelector('[role="dialog"][aria-modal="true"]');
  const still = () => reduced.matches || settings.motion === 'still';
  const applyPalette = () => {
    const p = palettes[settings.theme];
    metal.color.set(p.metal);
    trim.color.set(p.trim);
    sand.color.set(p.sand);
    glass.attenuationColor.set(p.glass);
    glow.color.set(p.light);
    grainMaterial.color.set(p.sand);
    starMaterial.color.set(p.trim);
  };
  const pose = (now: number) => {
    const fixed = still();
    amount = fixed
      ? target
      : Math.abs(target - amount) < 0.001
        ? target
        : T.MathUtils.lerp(amount, target, 0.09);
    bottom.visible = amount > 0.001;
    top.visible = amount < 0.999;
    if (
      Math.abs(geometryAmount - amount) > 0.002 ||
      (amount === target && geometryAmount !== target)
    ) {
      bottom.geometry.dispose();
      top.geometry.dispose();
      bottom.geometry = fillGeometry(lowerProfile, amount);
      top.geometry = fillGeometry(upperProfile, 1 - amount);
      geometryAmount = amount;
    }
    const lively = settings.motion === 'lively';
    group.rotation.y =
      orbit + (fixed ? 0 : pointer + Math.sin(now * 0.00022) * (lively ? 0.2 : 0.08));
    group.position.y = fixed ? 0 : Math.sin(now * 0.00075) * 0.018;
    starCloud.visible = !fixed && (lively || settings.theme === 'midnight');
    starCloud.rotation.y = now * 0.00006;
    starMaterial.opacity = 0.3 + Math.sin(now * 0.0011) * 0.12;
    grainCloud.visible = !fixed && now < flowingUntil && target > 0;
    if (grainCloud.visible) {
      const base = bottom.geometry.boundingBox?.max.y ?? -1.29;
      for (let i = 0; i < grains.length / 3; i++) {
        const t = (now * 0.0007 + i / 96) % 1;
        grainPositions.setXYZ(
          i,
          Math.sin(i * 2.4) * 0.012 * (1 + t),
          0.03 + t * (base - 0.03),
          Math.cos(i * 1.9) * 0.012,
        );
      }
      grainPositions.needsUpdate = true;
    }
  };
  const draw = (now = 0) => {
    frame = 0;
    if (disposed || !visible || document.hidden || blocked || !settings.active) return;
    if (!still()) frame = requestAnimationFrame(draw);
    if (!still() && now - last < 1000 / 24) return;
    last = now;
    pose(now);
    renderer.render(scene, camera);
  };
  const resume = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    draw(performance.now());
  };
  const move = (e: PointerEvent) => {
    if (still() || e.pointerType === 'touch') return;
    pointer =
      ((e.clientX - host.getBoundingClientRect().left) / Math.max(1, host.clientWidth) - 0.5) *
      0.28;
  };
  host.addEventListener('pointermove', move);
  const resize = new ResizeObserver(() => {
    if (!host.clientWidth || !host.clientHeight) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
    if (settings.active && !blocked && !document.hidden) {
      pose(performance.now());
      renderer.render(scene, camera);
    }
  });
  resize.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    resume();
  });
  intersection.observe(host);
  const overlay = new MutationObserver(() => {
    const next = !!document.querySelector('[role="dialog"][aria-modal="true"]');
    if (next !== blocked) {
      blocked = next;
      resume();
    }
  });
  overlay.observe(document.body, { childList: true, subtree: true });
  reduced.addEventListener('change', resume);
  document.addEventListener('visibilitychange', resume);
  applyPalette();
  pose(0);
  renderer.render(scene, camera);
  frame = requestAnimationFrame(draw);
  const dispose = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    intersection.disconnect();
    overlay.disconnect();
    host.removeEventListener('pointermove', move);
    reduced.removeEventListener('change', resume);
    document.removeEventListener('visibilitychange', resume);
    const materials = new Set<T.Material>();
    scene.traverse((node) => {
      if (node instanceof T.Mesh || node instanceof T.Points) {
        node.geometry.dispose();
        (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) =>
          materials.add(m),
        );
      }
    });
    materials.forEach((m) => m.dispose());
    environment.dispose();
    room.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  return Object.assign(dispose, {
    update: (next: { progress?: number } & Partial<HourglassOptions>) => {
      if (disposed) return;
      if (next.progress !== undefined) {
        const nextAmount = Math.max(0, Math.min(1, next.progress));
        if (nextAmount > target) flowingUntil = performance.now() + 1800;
        target = nextAmount;
      }
      settings = { ...settings, ...next };
      applyPalette();
      resume();
    },
    turn: (direction: number) => {
      orbit += (direction * Math.PI) / 6;
      resume();
    },
    reset: () => {
      orbit = 0;
      pointer = 0;
      resume();
    },
  });
}
export type HourglassController = ReturnType<typeof createHourglass>;
