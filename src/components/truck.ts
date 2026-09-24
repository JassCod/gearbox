import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Track = <T extends { dispose(): void }>(x: T) => T;

export type Truck = {
  root: THREE.Group;
  /** Advance wheel rotation by `spin` radians and animate cab/trailer suspension at time `t`. */
  update(t: number, spin: number): void;
  headlights: THREE.SpotLight[];
};

/**
 * A procedurally modelled cab-over prime mover towing a refrigerated box trailer in
 * Torqline livery. Static parts are merged per material (a handful of draw calls) and
 * all wheels are two instanced meshes, so it stays cheap to render.
 */
export function buildTruck(track: Track, aniso: number): Truck {
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  const cab = new THREE.Group();
  const trailer = new THREE.Group();
  root.add(chassis, cab, trailer);

  // ---------- Materials ----------
  const std = (p: THREE.MeshStandardMaterialParameters) => track(new THREE.MeshStandardMaterial(p));
  const M = {
    paint: track(new THREE.MeshPhysicalMaterial({ color: '#e7ebee', metalness: 0.15, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.2 })),
    accent: track(new THREE.MeshPhysicalMaterial({ color: '#0f6a66', metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 })),
    black: std({ color: '#141619', roughness: 0.62, metalness: 0.1 }),
    plastic: std({ color: '#2a2e33', roughness: 0.5, metalness: 0.15 }),
    chrome: std({ color: '#e3e8ee', metalness: 1, roughness: 0.14 }),
    alu: std({ color: '#c7ccd1', metalness: 1, roughness: 0.3 }),
    frame: std({ color: '#1b1c1f', metalness: 0.4, roughness: 0.55 }),
    glass: track(new THREE.MeshPhysicalMaterial({ color: '#0a0e13', metalness: 0.1, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5 })),
    mirror: std({ color: '#b8c0cc', metalness: 1, roughness: 0.03 }),
    lens: std({ color: '#e8eef5', emissive: '#fff4e2', emissiveIntensity: 2.2, roughness: 0.1 }),
    drl: std({ color: '#ffffff', emissive: '#f2f7ff', emissiveIntensity: 6 }),
    amber: std({ color: '#ffb54a', emissive: '#ff9a1a', emissiveIntensity: 3 }),
    red: std({ color: '#ff3b30', emissive: '#ff1a0a', emissiveIntensity: 2.5 }),
    rubber: std({ color: '#151515', roughness: 0.88 }),
    rim: std({ color: '#d5dade', metalness: 1, roughness: 0.2 }),
  };

  // ---------- Merge buckets ----------
  const buckets = new Map<THREE.Group, Map<THREE.Material, THREE.BufferGeometry[]>>();
  const tmpE = new THREE.Euler(); const tmpQ = new THREE.Quaternion(); const tmpM = new THREE.Matrix4(); const one = new THREE.Vector3(1, 1, 1);
  const part = (group: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = one) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(tmpM.compose(new THREE.Vector3(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), s));
    if (!buckets.has(group)) buckets.set(group, new Map());
    const b = buckets.get(group)!;
    if (!b.has(mat)) b.set(mat, []);
    b.get(mat)!.push(g);
  };
  const rbox = (w: number, h: number, d: number, r: number, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r1: number, r2: number, h: number, seg = 16) => new THREE.CylinderGeometry(r1, r2, h, seg);
  // Profile in the side (z, y) plane, extruded across the width with rounded edges.
  const sideExtrude = (pts: [number, number][], width: number, bevel: number, curves?: (s: THREE.Shape) => void) => {
    const s = new THREE.Shape();
    if (curves) curves(s); else { s.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(([a, b]) => s.lineTo(a, b)); }
    const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 10 });
    g.rotateY(-Math.PI / 2);
    g.translate((width - bevel * 2) / 2, 0, 0);
    return g;
  };
  // Flat panel on a cab side, from a (z, y) outline.
  const sidePanel = (pts: [number, number][], x: number) => {
    const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(x > 0 ? -z : z, y)));
    const g = new THREE.ShapeGeometry(s);
    g.rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.translate(x, 0, 0);
    return g;
  };

  // ---------- Cab (cab-over, high roof) ----------
  const W = 2.5; const BEV = 0.17;
  part(cab, sideExtrude([], W, BEV, (s) => {
    s.moveTo(0.66, 1.22);
    s.lineTo(2.62, 1.22);
    s.lineTo(2.72, 1.62);
    s.lineTo(2.74, 2.26);
    s.lineTo(2.70, 2.42);
    s.lineTo(2.48, 3.40);
    s.quadraticCurveTo(2.44, 3.62, 2.24, 3.64);
    s.lineTo(0.92, 3.76);
    s.quadraticCurveTo(0.66, 3.78, 0.66, 3.55);
    s.lineTo(0.66, 1.22);
  }), M.paint, 0, 0, 0);
  // Roof deflector up to trailer height
  part(cab, sideExtrude([[2.05, 3.66], [0.95, 4.2], [0.7, 4.22], [0.7, 3.7]], 2.3, 0.06), M.paint, 0, 0, 0);
  // Windshield with black gasket and wipers
  const n = new THREE.Vector2(0.976, 0.219); const tilt = -Math.atan2(0.219, 0.976);
  const wsC = new THREE.Vector2(2.59, 2.91).addScaledVector(n, BEV + 0.012);
  part(cab, rbox(2.26, 1.06, 0.02, 0.06), M.black, 0, wsC.y - n.y * 0.006, wsC.x - n.x * 0.006, tilt);
  part(cab, rbox(2.16, 0.98, 0.02, 0.06), M.glass, 0, wsC.y, wsC.x, tilt);
  for (const x of [-0.5, 0.55]) part(cab, box(0.95, 0.025, 0.025), M.black, x, 2.5, 2.9, tilt, 0, x > 0 ? 0.06 : -0.06);
  // Side windows, door seams, handles, grab rails, mirrors, steps, cab-side extenders
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.004);
    part(cab, sidePanel([[1.5, 2.42], [2.58, 2.42], [2.36, 3.28], [1.5, 3.28]], x * 1.0005), M.black, 0, 0, 0);
    part(cab, sidePanel([[1.55, 2.47], [2.51, 2.47], [2.32, 3.23], [1.55, 3.23]], x * 1.001), M.glass, 0, 0, 0);
    part(cab, box(0.012, 2.05, 0.014), M.black, x * 1.001, 2.28, 1.44);          // rear door seam
    part(cab, box(0.012, 1.18, 0.014), M.black, x * 1.001, 1.83, 2.64);          // front door seam
    part(cab, rbox(0.03, 0.05, 0.22, 0.012), M.black, x * 1.006, 2.25, 1.64);   // door handle
    part(cab, cyl(0.022, 0.022, 0.95, 10), M.chrome, x * 1.035, 1.95, 1.33);    // grab rail
    // Mirrors: arm, main housing (paint back, mirror glass facing rearwards) and a wide-angle below.
    part(cab, cyl(0.025, 0.025, 0.36, 8), M.black, sx * 1.42, 3.12, 2.52, 0, 0, Math.PI / 2);
    part(cab, rbox(0.12, 0.66, 0.26, 0.05), M.paint, sx * 1.62, 2.92, 2.55);
    part(cab, box(0.1, 0.6, 0.02), M.mirror, sx * 1.62, 2.92, 2.41);
    part(cab, rbox(0.1, 0.26, 0.2, 0.04), M.black, sx * 1.6, 2.4, 2.55);
    part(cab, cyl(0.02, 0.02, 0.5, 8), M.black, sx * 1.58, 2.64, 2.55);
    // Step well with two alloy treads
    part(cab, box(0.06, 0.64, 1.02), M.black, sx * 1.2, 0.86, 2.02);
    for (const y of [0.62, 0.98]) part(cab, box(0.24, 0.04, 0.96), M.alu, sx * 1.14, y, 2.02);
    // Side extender panel bridging the gap to the trailer
    part(cab, box(0.04, 1.9, 0.5), M.accent, sx * 1.2, 2.65, 0.42);
    part(cab, box(0.012, 0.16, 1.9), M.accent, x * 1.002, 1.42, 1.66);                // brand pin-stripe
  }
  // Grille, headlights, bumper, fog lights, sun visor, roof markers
  part(cab, rbox(1.86, 0.66, 0.06, 0.04), M.black, 0, 1.92, 2.910);
  // Brand badge across the top of the grille
  const badge = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e9eef2'; g.font = '800 50px Inter, "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('T O R Q L I N E', 256, 34);
    const t = track(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t;
  })();
  const badgeMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(1.1, 0.14)), std({ map: badge, transparent: true, metalness: 0.6, roughness: 0.3 }));
  badgeMesh.position.set(0, 2.17, 2.975); cab.add(badgeMesh);
  for (let i = 0; i < 5; i++) part(cab, box(1.74, 0.045, 0.03), i === 2 ? M.chrome : M.plastic, 0, 1.68 + i * 0.12, 2.945);
  for (const sx of [-1, 1]) {
    part(cab, rbox(0.66, 0.3, 0.12, 0.05), M.black, sx * 0.88, 1.38, 2.900);
    part(cab, rbox(0.24, 0.17, 0.03, 0.04), M.lens, sx * 0.99, 1.37, 2.970);
    part(cab, rbox(0.2, 0.15, 0.03, 0.04), M.lens, sx * 0.74, 1.37, 2.970);
    part(cab, box(0.54, 0.03, 0.02), M.drl, sx * 0.88, 1.5, 2.970);
    part(cab, box(0.08, 0.14, 0.03), M.amber, sx * 1.16, 1.37, 2.950);
    part(cab, cyl(0.065, 0.065, 0.04, 20), M.lens, sx * 0.98, 0.86, 3.140, Math.PI / 2);
  }
  part(cab, rbox(2.58, 0.54, 0.4, 0.09), M.plastic, 0, 0.94, 2.950);
  part(cab, box(2.36, 0.08, 0.34), M.black, 0, 0.64, 2.970);
  part(cab, rbox(0.56, 0.16, 0.02, 0.02), M.chrome, 0, 0.97, 3.155);
  part(cab, rbox(2.3, 0.05, 0.36, 0.02), M.paint, 0, 3.6, 2.6, 0.14);
  for (let i = -2; i <= 2; i++) part(cab, rbox(0.1, 0.035, 0.05, 0.012), M.amber, i * 0.42, 3.575, 2.79);
  // Front wheel mudguards (tucked under the cab floor)
  const guard = (r: number, w: number, from: number, len: number) => new THREE.CylinderGeometry(r, r, w, 24, 1, true, from, len);
  for (const sx of [-1, 1]) part(chassis, guard(0.62, 0.42, Math.PI * 0.55, Math.PI * 0.75), M.black, sx * 1.05, 0.53, 2.15, 0, 0, Math.PI / 2);

  // ---------- Chassis ----------
  for (const sx of [-1, 1]) part(chassis, box(0.1, 0.3, 7.9), M.frame, sx * 0.42, 0.92, -1.35);
  part(chassis, box(1.9, 0.12, 0.14), M.frame, 0, 0.55, 2.15);
  for (const z of [-2.45, -3.8]) part(chassis, cyl(0.12, 0.12, 1.9, 12), M.frame, 0, 0.53, z, 0, 0, Math.PI / 2);
  // Fuel tank on the camera side, battery box / AdBlue on the other
  part(chassis, rbox(0.62, 0.62, 1.7, 0.16, 4), M.alu, -0.95, 0.82, -0.35);
  for (const z of [-0.95, 0.25]) part(chassis, box(0.66, 0.66, 0.05), M.black, -0.95, 0.82, z);
  part(chassis, cyl(0.06, 0.06, 0.05, 16), M.chrome, -0.95, 1.15, 0.05);
  part(chassis, rbox(0.55, 0.55, 1.2, 0.05), M.black, 0.95, 0.82, -0.3);
  part(chassis, box(1.25, 0.1, 1.1), M.frame, 0, 1.13, -3.0); // fifth wheel
  // Rear quarter fenders over the tandem duals, mudflaps
  for (const sx of [-1, 1]) {
    for (const z of [-2.45, -3.8]) part(chassis, guard(0.62, 0.68, Math.PI * 0.2, Math.PI * 0.6), M.black, sx * 0.94, 0.53, z, 0, 0, Math.PI / 2);
    part(chassis, box(0.66, 0.6, 0.02), M.black, sx * 0.94, 0.52, -4.5);
  }
  // Air and electrical lines between the cab and trailer
  const coil = (color: string, x: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) { const a = i / 60; pts.push(new THREE.Vector3(x + Math.sin(a * 40) * 0.05, 2.1 - Math.sin(a * Math.PI) * 0.35, 0.34 - a * 0.7 + Math.cos(a * 40) * 0.05)); }
    part(chassis, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.012, 6), std({ color, roughness: 0.5 }), 0, 0, 0);
  };
  coil('#c62828', -0.25); coil('#1e5bd6', 0.0); coil('#1a1a1a', 0.25);

  // ---------- Trailer ----------
  const TF = -0.45; const TL = 13.6; const TB = 1.35; const TH = 2.9; const TW = 2.55;
  const tz = TF - TL / 2;
  const livery = (() => {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 436;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 436); grad.addColorStop(0, '#f7f8f9'); grad.addColorStop(1, '#dde2e6');
    g.fillStyle = grad; g.fillRect(0, 0, 2048, 436);
    // Panel seams with rivets
    for (let x = 0; x <= 2048; x += 128) {
      g.fillStyle = 'rgba(40,50,60,.12)'; g.fillRect(x, 0, 2, 436);
      g.fillStyle = 'rgba(40,50,60,.22)'; for (let y = 10; y < 436; y += 18) g.fillRect(x - 5, y, 2, 2);
    }
    // Brand band
    g.fillStyle = '#0e6f68'; g.beginPath(); g.moveTo(0, 330); g.bezierCurveTo(700, 300, 1300, 360, 2048, 300); g.lineTo(2048, 436); g.lineTo(0, 436); g.fill();
    g.fillStyle = '#f59e0b'; g.beginPath(); g.moveTo(0, 318); g.bezierCurveTo(700, 288, 1300, 348, 2048, 288); g.lineTo(2048, 298); g.bezierCurveTo(1300, 358, 700, 298, 0, 328); g.fill();
    g.fillStyle = '#0b3b37'; g.font = '800 170px Inter, "Segoe UI", system-ui, sans-serif'; g.fillText('TORQLINE', 110, 210);
    g.fillStyle = '#3d5561'; g.font = '600 46px Inter, "Segoe UI", system-ui, sans-serif'; g.fillText('Fleet maintenance  ·  Compliance  ·  Cold chain', 118, 272);
    g.fillStyle = '#ffffff'; g.font = '600 34px Inter, "Segoe UI", system-ui, sans-serif'; g.fillText('torqline fleet', 1760, 400);
    const t = track(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    return t;
  })();
  const plain = std({ color: '#eceff2', roughness: 0.42, metalness: 0.15 });
  const side = std({ map: livery, roughness: 0.4, metalness: 0.15 });
  const body = new THREE.Mesh(track(new RoundedBoxGeometry(TW, TH, TL, 2, 0.04)), [side, side, plain, plain, plain, plain]);
  body.position.set(0, TB + TH / 2, tz); body.castShadow = true; body.receiveShadow = true;
  trailer.add(body);
  for (const sx of [-1, 1]) {
    part(trailer, box(0.05, 0.12, TL), M.alu, sx * (TW / 2 + 0.01), TB + TH - 0.05, tz);
    part(trailer, box(0.06, 0.16, TL), M.alu, sx * (TW / 2 + 0.01), TB + 0.06, tz);
    for (const z of [TF - 0.03, TF - TL + 0.03]) part(trailer, box(0.08, TH, 0.08), M.alu, sx * (TW / 2 - 0.02), TB + TH / 2, z);
    // Side marker lights along the bottom rail
    for (let z = TF - 0.8; z > TF - TL; z -= 1.9) part(trailer, box(0.03, 0.05, 0.1), M.amber, sx * (TW / 2 + 0.04), TB + 0.06, z);
    // Side underrun rails and brackets
    for (const y of [0.62, 0.98]) part(trailer, box(0.05, 0.1, 4.6), M.alu, sx * 1.2, y, -7.6);
    for (const z of [-5.5, -7.6, -9.7]) part(trailer, box(0.05, 0.55, 0.08), M.frame, sx * 1.18, 1.08, z);
    // Landing legs with feet
    part(trailer, box(0.14, 1.0, 0.14), M.frame, sx * 0.85, 0.85, -4.95);
    part(trailer, box(0.3, 0.04, 0.3), M.frame, sx * 0.85, 0.34, -4.95);
    // Flat mudguards over the tri-axle group, mudflaps
    part(trailer, box(0.52, 0.04, 4.1), M.black, sx * 1.02, 1.14, -11.5);
    part(trailer, box(0.5, 0.55, 0.02), M.black, sx * 1.02, 0.6, -13.55);
  }
  part(trailer, cyl(0.02, 0.02, 0.35, 8), M.frame, -1.0, 0.95, -4.95, 0, 0, Math.PI / 2); // landing gear crank
  part(trailer, box(TW - 0.1, 0.2, TL - 0.2), M.frame, 0, TB - 0.08, tz);             // floor / cross-members
  // Refrigeration unit on the front wall
  part(trailer, rbox(2.1, 1.7, 0.42, 0.08), plain, 0, 3.3, TF + 0.2);
  part(trailer, rbox(1.5, 0.9, 0.04, 0.03), M.black, 0, 3.45, TF + 0.42);
  for (let i = 0; i < 7; i++) part(trailer, box(1.42, 0.03, 0.02), M.plastic, 0, 3.08 + i * 0.12, TF + 0.445);
  // Rear lights & underride bar
  for (const sx of [-1, 1]) part(trailer, rbox(0.34, 0.12, 0.05, 0.02), M.red, sx * 0.95, 1.25, TF - TL - 0.02);
  part(trailer, box(2.3, 0.12, 0.12), M.frame, 0, 0.62, TF - TL + 0.2);

  // ---------- Merge ----------
  for (const [group, mats] of buckets) {
    for (const [mat, geos] of mats) {
      const merged = track(mergeGeometries(geos));
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // ---------- Wheels (instanced) ----------
  const R = 0.53;
  const tyreProfile: [number, number][] = [[0.29, -0.13], [0.4, -0.152], [0.47, -0.158], [0.51, -0.15], [0.528, -0.125], [R, -0.08], [R, 0], [R, 0.08], [0.528, 0.125], [0.51, 0.15], [0.47, 0.158], [0.4, 0.152], [0.29, 0.13]];
  const tyreGeo = track(new THREE.LatheGeometry(tyreProfile.map(([r, y]) => new THREE.Vector2(r, y)), 56).rotateZ(-Math.PI / 2));
  const tread = (() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#808080'; g.fillRect(0, 0, 1024, 64);
    g.fillStyle = '#1a1a1a';
    for (let x = 0; x < 1024; x += 16) { g.fillRect(x, 22, 5, 20); g.fillRect(x + 8, 20, 3, 6); g.fillRect(x + 8, 38, 3, 6); }
    for (const y of [27, 36]) g.fillRect(0, y, 1024, 2);
    const t = track(new THREE.CanvasTexture(c)); t.anisotropy = aniso; return t;
  })();
  M.rubber.bumpMap = tread; M.rubber.bumpScale = 2;
  // Polished alloy rim: dished face, hub, cap and ten wheel nuts
  const rimProfile: [number, number][] = [[0.02, 0.1], [0.07, 0.1], [0.075, 0.125], [0.1, 0.13], [0.105, 0.105], [0.19, 0.092], [0.24, 0.1], [0.275, 0.125], [0.3, 0.14], [0.305, 0.12], [0.3, -0.1]];
  const rimParts: THREE.BufferGeometry[] = [new THREE.LatheGeometry(rimProfile.map(([r, y]) => new THREE.Vector2(r, y)), 40).rotateZ(-Math.PI / 2).toNonIndexed()];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    rimParts.push(new THREE.CylinderGeometry(0.017, 0.017, 0.05, 6).rotateZ(Math.PI / 2).translate(0.125, Math.sin(a) * 0.15, Math.cos(a) * 0.15).toNonIndexed());
  }
  rimParts.push(new THREE.CylinderGeometry(0.05, 0.07, 0.06, 16).rotateZ(Math.PI / 2).translate(0.13, 0, 0).toNonIndexed());
  rimParts.forEach((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); });
  const rimGeo = track(mergeGeometries(rimParts));
  rimParts.forEach((g) => g.dispose());

  type W = { x: number; z: number; left: boolean; wide: number };
  const wheels: W[] = [];
  for (const sx of [-1, 1]) {
    wheels.push({ x: sx * 1.05, z: 2.15, left: sx < 0, wide: 1 });
    for (const z of [-2.45, -3.8]) { wheels.push({ x: sx * 1.1, z, left: sx < 0, wide: 1 }); wheels.push({ x: sx * 0.77, z, left: sx > 0, wide: 1 }); }
    for (const z of [-10.2, -11.5, -12.8]) wheels.push({ x: sx * 1.0, z, left: sx < 0, wide: 1.35 });
  }
  const tyres = new THREE.InstancedMesh(tyreGeo, M.rubber, wheels.length);
  const rims = new THREE.InstancedMesh(rimGeo, M.rim, wheels.length);
  tyres.castShadow = true; tyres.receiveShadow = true; rims.receiveShadow = true;
  chassis.add(tyres, rims);
  const wq = new THREE.Quaternion(); const wp = new THREE.Vector3(); const ws = new THREE.Vector3(); const we = new THREE.Euler();
  let roll = 0;
  const placeWheels = () => {
    wheels.forEach((w, i) => {
      we.set(w.left ? -roll : roll, w.left ? Math.PI : 0, 0, 'YXZ');
      wq.setFromEuler(we); wp.set(w.x, R, w.z); ws.set(w.wide, 1, 1);
      tmpM.compose(wp, wq, ws);
      tyres.setMatrixAt(i, tmpM); rims.setMatrixAt(i, tmpM);
    });
    tyres.instanceMatrix.needsUpdate = true; rims.instanceMatrix.needsUpdate = true;
  };
  placeWheels();

  // Headlight beams onto the road ahead
  const headlights: THREE.SpotLight[] = [];
  for (const sx of [-1, 1]) {
    const s = new THREE.SpotLight('#fff1dc', 170, 70, 0.42, 0.95, 1.5);
    s.position.set(sx * 0.9, 1.38, 3.0); s.target.position.set(sx * 1.6, 0, 30);
    cab.add(s, s.target); headlights.push(s);
  }

  return {
    root,
    headlights,
    update(t, spin) {
      roll += spin;
      placeWheels();
      // Cab floats on its air suspension; the trailer leans a touch.
      cab.position.y = Math.sin(t * 5.3) * 0.004 + Math.sin(t * 8.9) * 0.002;
      cab.rotation.x = Math.sin(t * 1.6) * 0.0035;
      cab.rotation.z = Math.sin(t * 1.1) * 0.003;
      trailer.rotation.z = Math.sin(t * 0.8 + 1) * 0.0022;
    },
  };
}
