import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Procedural 3D object, no remote textures/models and no render loop outside the viewport. */
export function createHourglass(host: HTMLElement, progress: number) {
  const renderer = new T.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.transmissionResolutionScale = 0.5;
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(34, host.clientWidth / host.clientHeight, 0.1, 30);
  camera.position.set(3.8, 2.1, 5.8);
  camera.lookAt(0, 0, 0);
  const pmrem = new T.PMREMGenerator(renderer),
    room = new RoomEnvironment(),
    environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  const group = new T.Group();
  group.rotation.z = -0.08;
  scene.add(group);
  const bronze = new T.MeshStandardMaterial({ color: '#967752', metalness: 0.68, roughness: 0.3 });
  const gold = new T.MeshStandardMaterial({ color: '#d3b16e', metalness: 0.28, roughness: 0.66 });
  const glass = new T.MeshPhysicalMaterial({
    color: '#fff9ee',
    roughness: 0.06,
    metalness: 0,
    transmission: 1,
    thickness: 0.15,
    ior: 1.46,
    clearcoat: 1,
    side: T.DoubleSide,
    attenuationColor: new T.Color('#e8c6ac'),
    attenuationDistance: 2,
  });
  const mesh = (geometry: T.BufferGeometry, material: T.Material, y = 0) => {
    const m = new T.Mesh(geometry, material);
    m.position.y = y;
    group.add(m);
    return m;
  };
  for (const y of [-1.48, 1.48]) {
    mesh(new T.CylinderGeometry(0.86, 0.86, 0.13, 64), bronze, y);
    mesh(new T.CylinderGeometry(0.72, 0.75, 0.07, 64), gold, y + (y < 0 ? 0.1 : -0.1));
    const ring = mesh(new T.TorusGeometry(0.8, 0.028, 12, 64), gold, y);
    ring.rotation.x = Math.PI / 2;
  }
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + 0.3;
    const post = mesh(new T.CylinderGeometry(0.037, 0.037, 2.83, 12), bronze);
    post.position.set(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75);
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
  mesh(new T.LatheGeometry(profile, 64), glass);
  const sand = new T.MeshStandardMaterial({ color: '#d8af73', roughness: 0.95, metalness: 0.02 });
  const amount = Math.max(0, Math.min(1, progress)),
    height = 0.1 + amount * 0.85;
  mesh(
    new T.LatheGeometry(
      [
        new T.Vector2(0, -1.31),
        new T.Vector2(0.43, -1.31),
        new T.Vector2(0.58, -1.15),
        new T.Vector2(0.52, -1.26 + height * 0.45),
        new T.Vector2(0.29, -1.26 + height),
        new T.Vector2(0, -1.16 + height),
      ],
      48,
    ),
    sand,
  );
  if (amount < 0.98)
    mesh(
      new T.LatheGeometry(
        [
          new T.Vector2(0, 0.2),
          new T.Vector2(0.07, 0.25),
          new T.Vector2(0.35, 0.65),
          new T.Vector2(0.58, 1.08),
          new T.Vector2(0.52, 1.18 - amount * 0.35),
          new T.Vector2(0, 1.18 - amount * 0.35),
        ],
        48,
      ),
      sand,
    );
  const stream = mesh(
    new T.CylinderGeometry(0.009, 0.012, 1.7 - height, 8),
    sand,
    -0.25 + height * 0.5,
  );
  const glow = new T.PointLight('#ffe1ac', 20, 10);
  glow.position.set(-2, 3, 3);
  scene.add(glow, new T.HemisphereLight('#fff9e6', '#b08a73', 2));
  const floor = new T.Mesh(
    new T.CircleGeometry(1.15, 48),
    new T.MeshBasicMaterial({
      color: '#896e50',
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.6;
  scene.add(floor);
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Đồng hồ cát 3D của nhịp yêu thương');
  renderer.domElement.setAttribute('role', 'img');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = true,
    frame = 0,
    last = 0,
    disposed = false,
    dragX = 0;
  const draw = (now = 0) => {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    if (!motion.matches) frame = requestAnimationFrame(draw);
    if (!motion.matches && now - last < 1000 / 24) return;
    last = now;
    group.rotation.y = dragX + (motion.matches ? 0 : Math.sin(now * 0.00024) * 0.12);
    group.position.y = motion.matches ? 0 : Math.sin(now * 0.0008) * 0.025;
    stream.visible = !motion.matches && amount < 1;
    renderer.render(scene, camera);
  };
  const move = (event: PointerEvent) => {
    if (motion.matches) return;
    dragX = ((event.clientX - host.getBoundingClientRect().left) / host.clientWidth - 0.5) * 0.5;
  };
  host.addEventListener('pointermove', move);
  const resize = new ResizeObserver(() => {
    if (!host.clientWidth || !host.clientHeight) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.render(scene, camera);
  });
  resize.observe(host);
  const resume = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!disposed && visible && !document.hidden) draw(performance.now());
  };
  motion.addEventListener('change', resume);
  document.addEventListener('visibilitychange', resume);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    resume();
  });
  intersection.observe(host);
  renderer.render(scene, camera);
  frame = requestAnimationFrame(draw);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    intersection.disconnect();
    host.removeEventListener('pointermove', move);
    motion.removeEventListener('change', resume);
    document.removeEventListener('visibilitychange', resume);
    scene.traverse((node) => {
      if (node instanceof T.Mesh) {
        node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((m) => m.dispose());
      }
    });
    environment.dispose();
    room.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
