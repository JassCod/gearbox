import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * A cinematic tracking shot at sunset: a PBR car cruises down a country highway,
 * filmed from a camera car driving alongside, while oncoming traffic, street lights
 * and roadside scenery stream past. The sky is physically based (Rayleigh/Mie
 * scattering) and also lights the scene through a pre-filtered environment map.
 */

const CAR_URL = `${import.meta.env.BASE_URL}assets/car.glb`;
const LANE = 3.6;          // metres
const PERIOD = 48;         // everything static repeats every 48 m, so the world can wrap seamlessly
const HERO_SPEED = 22;     // m/s ≈ 80 km/h
const ONCOMING_SPEED = 20; // m/s

type CarRig = { root: THREE.Object3D; wheels: THREE.Object3D[] };

export default function LoginScene({ onReady }: { onReady?: () => void }) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    } catch {
      onReady?.();
      return; // No WebGL – the CSS backdrop behind the canvas stays visible.
    }
    let disposed = false;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    renderer.setPixelRatio(pixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const disposables: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 3000);

    // ---------- Sky: physical scattering, low sun behind the car ----------
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 + 0.8), THREE.MathUtils.degToRad(214));
    const makeSky = (scale: number) => {
      const s = new Sky();
      s.scale.setScalar(scale);
      const u = s.material.uniforms;
      u.turbidity.value = 4.5; u.rayleigh.value = 3.0; u.mieCoefficient.value = 0.0045; u.mieDirectionalG.value = 0.86;
      u.sunPosition.value.copy(sunDir);
      u.cloudCoverage.value = 0.32; u.cloudDensity.value = 0.35; u.cloudElevation.value = 0.55;
      track(s.geometry); track(s.material);
      return s;
    };
    const sky = makeSky(2500);
    scene.add(sky);

    // Environment lighting baked from the same sky, with a dark ground below the horizon.
    const pmrem = track(new THREE.PMREMGenerator(renderer));
    const envScene = new THREE.Scene();
    envScene.add(makeSky(50));
    const envGround = new THREE.Mesh(track(new THREE.CircleGeometry(60, 32)), track(new THREE.MeshBasicMaterial({ color: '#2e2a27' })));
    envGround.rotation.x = -Math.PI / 2; envGround.position.y = -0.5; envScene.add(envGround);
    scene.environment = track(pmrem.fromScene(envScene, 0.02, 0.1, 200)).texture;
    scene.environmentIntensity = 1.25;

    const fogColor = new THREE.Color('#57506a');
    scene.fog = new THREE.FogExp2(fogColor, 0.0014);

    const sun = new THREE.DirectionalLight('#ff9a5c', 0.8);
    sun.position.set(sunDir.x, 0.09, sunDir.z).normalize().multiplyScalar(80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 40, far: 140 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    const skyFill = new THREE.DirectionalLight('#9fb2ff', 1.5); // twilight dome opposite the sunset
    skyFill.position.set(6, 5, 9);
    scene.add(skyFill);

    // ---------- Texture helpers ----------
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d')!);
      const t = track(new THREE.CanvasTexture(c));
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    };
    const noiseFill = (g: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], amp: number, speckle = 0) => {
      const img = g.createImageData(w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        let n = (Math.random() - 0.5) * amp;
        if (speckle && Math.random() < speckle) n += 40 + Math.random() * 40; // bright aggregate stones
        img.data[i] = base[0] + n; img.data[i + 1] = base[1] + n; img.data[i + 2] = base[2] + n; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    };
    const radial = (inner: string, outer: string) => canvasTex(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    });
    const softBlob = radial('rgba(0,0,0,.85)', 'rgba(0,0,0,0)');
    const lightBlob = radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

    // ---------- The moving world ----------
    // Everything attached to `world` scrolls towards -z and wraps every PERIOD metres.
    const world = new THREE.Group();
    scene.add(world);
    const LEN = 720; const Z0 = 90; // road runs from z = +90 to z = -630
    const zMid = Z0 - LEN / 2;
    const roadLeft = -LANE * 1.5 - 0.9; const roadRight = LANE * 0.5 + 0.9;
    const roadWidth = roadRight - roadLeft; const roadCx = (roadLeft + roadRight) / 2;

    // Asphalt: fine aggregate detail (2 m tiles) plus large-scale patching in the roughness map.
    const asphalt = canvasTex(1024, 1024, (g) => {
      noiseFill(g, 1024, 1024, [52, 52, 55], 34, 0.012);
      g.globalAlpha = 0.25;
      for (let i = 0; i < 90; i++) { g.fillStyle = Math.random() < 0.5 ? '#1c1c1f' : '#5d5d61'; g.beginPath(); g.arc(Math.random() * 1024, Math.random() * 1024, 2 + Math.random() * 6, 0, 7); g.fill(); }
    });
    const asphaltBump = canvasTex(512, 512, (g) => noiseFill(g, 512, 512, [128, 128, 128], 120), false);
    const patches = canvasTex(256, 1024, (g) => {
      g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, 256, 1024);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,90,90' : '230,230,230'},${0.15 + Math.random() * 0.25})`; g.fillRect(Math.random() * 256, Math.random() * 1024, 20 + Math.random() * 90, 30 + Math.random() * 200); }
      g.fillStyle = 'rgba(120,120,120,.45)'; g.fillRect(54, 0, 34, 1024); g.fillRect(168, 0, 34, 1024); // polished wheel tracks read glossier
    }, false);
    const roadGeo = track(new THREE.PlaneGeometry(roadWidth, LEN, 1, 1));
    {
      const uv = roadGeo.attributes.uv; const uv1 = new Float32Array(uv.count * 2);
      for (let i = 0; i < uv.count; i++) { uv1[i * 2] = uv.getX(i); uv1[i * 2 + 1] = uv.getY(i) * (LEN / PERIOD); uv.setXY(i, uv.getX(i) * roadWidth / 2, uv.getY(i) * LEN / 2); }
      roadGeo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    }
    patches.channel = 1;
    const road = new THREE.Mesh(roadGeo, track(new THREE.MeshStandardMaterial({ map: asphalt, bumpMap: asphaltBump, bumpScale: 0.6, roughnessMap: patches, roughness: 0.95, metalness: 0 })));
    road.rotation.x = -Math.PI / 2; road.position.set(roadCx, 0, zMid); road.receiveShadow = true;
    world.add(road);

    // Line markings as separate decals, so they stay crisp.
    const lineMat = track(new THREE.MeshStandardMaterial({ color: '#e8e6df', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    const addLine = (x: number, w: number) => {
      const m = new THREE.Mesh(track(new THREE.PlaneGeometry(w, LEN)), lineMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, zMid); m.receiveShadow = true; world.add(m);
    };
    addLine(roadLeft + 0.45, 0.15); addLine(roadRight - 0.45, 0.15);
    const dashGeo = track(new THREE.PlaneGeometry(0.12, 3).rotateX(-Math.PI / 2));
    const dashes = new THREE.InstancedMesh(dashGeo, lineMat, LEN / 12);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < LEN / 12; i++) dashes.setMatrixAt(i, mtx.makeTranslation(-LANE / 2, 0.005, Z0 - i * 12));
    dashes.receiveShadow = true; world.add(dashes);
    // Raised reflective pavement markers ("cat's eyes") between the dashes
    const catGeo = track(new THREE.BoxGeometry(0.1, 0.02, 0.1));
    const cats = new THREE.InstancedMesh(catGeo, track(new THREE.MeshStandardMaterial({ color: '#fff4d0', emissive: '#ffd27a', emissiveIntensity: 1.5 })), LEN / 24);
    for (let i = 0; i < LEN / 24; i++) cats.setMatrixAt(i, mtx.makeTranslation(-LANE / 2, 0.01, Z0 - 6 - i * 24));
    world.add(cats);

    // Gravel shoulders and grass verges
    const gravel = canvasTex(512, 512, (g) => noiseFill(g, 512, 512, [98, 90, 78], 60, 0.04));
    const shoulderMat = track(new THREE.MeshStandardMaterial({ map: gravel, roughness: 1 }));
    for (const [x, w] of [[roadLeft - 1.2, 2.4], [roadRight + 1.2, 2.4]] as const) {
      const g = track(new THREE.PlaneGeometry(w, LEN));
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 3, uv.getY(i) * LEN / 3);
      const m = new THREE.Mesh(g, shoulderMat); m.rotation.x = -Math.PI / 2; m.position.set(x, -0.02, zMid); m.receiveShadow = true; world.add(m);
    }
    const grass = canvasTex(512, 512, (g) => {
      noiseFill(g, 512, 512, [66, 72, 38], 30);
      for (let i = 0; i < 4000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(40,52,22,.8)' : 'rgba(120,112,60,.6)'; g.fillRect(Math.random() * 512, Math.random() * 512, 1, 3 + Math.random() * 4); }
    });
    const groundW = 1400;
    const groundGeo = track(new THREE.PlaneGeometry(groundW, LEN + 200));
    { const uv = groundGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * groundW / 4, uv.getY(i) * (LEN + 200) / 4); }
    const ground = new THREE.Mesh(groundGeo, track(new THREE.MeshStandardMaterial({ map: grass, roughness: 1, color: '#9a9a88' })));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, zMid - 100); ground.receiveShadow = true;
    world.add(ground);

    // W-beam guardrail on galvanised posts along the far side
    const railX = roadLeft - 2.2;
    const beam = new THREE.Shape();
    const prof: [number, number][] = [[0, 0], [0.03, 0.04], [0.0, 0.08], [0.03, 0.16], [0.0, 0.24], [0.03, 0.28], [0, 0.32]];
    beam.moveTo(prof[0][0], prof[0][1]); prof.slice(1).forEach(([x, y]) => beam.lineTo(x, y));
    [...prof].reverse().forEach(([x, y]) => beam.lineTo(x - 0.006, y));
    const railGeo = track(new THREE.ExtrudeGeometry(beam, { depth: LEN, bevelEnabled: false, steps: 1 }));
    const galv = track(new THREE.MeshStandardMaterial({ color: '#a8b0b4', metalness: 0.85, roughness: 0.42 }));
    const rail = new THREE.Mesh(railGeo, galv); rail.position.set(railX, 0.55, Z0 - LEN); rail.castShadow = true; rail.receiveShadow = true;
    world.add(rail);
    const posts = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.1, 0.9, 0.15)), galv, LEN / 2);
    for (let i = 0; i < LEN / 2; i++) posts.setMatrixAt(i, mtx.makeTranslation(railX - 0.08, 0.45, Z0 - i * 2));
    posts.castShadow = true; world.add(posts);

    // Amber delineators on every sixth guardrail post
    const reflectors = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.02, 0.12, 0.08)), track(new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff9a1f', emissiveIntensity: 2.4 })), LEN / 12);
    for (let i = 0; i < LEN / 12; i++) reflectors.setMatrixAt(i, mtx.makeTranslation(railX + 0.04, 0.78, Z0 - i * 12));
    world.add(reflectors);

    // Street lights on the far side, arms reaching over the road
    const poleMat = track(new THREE.MeshStandardMaterial({ color: '#7d8589', metalness: 0.8, roughness: 0.45 }));
    const lampLens = track(new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffe2ad', emissiveIntensity: 9 }));
    const poleX = railX - 0.9;
    const armCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 8.2, 0), new THREE.Vector3(0, 9.6, 0), new THREE.Vector3(3.2, 9.4, 0));
    const lampParts = [
      new THREE.CylinderGeometry(0.08, 0.14, 8.4, 12).translate(0, 4.2, 0).toNonIndexed(),
      new THREE.TubeGeometry(armCurve, 16, 0.055, 8).toNonIndexed(),
      new THREE.BoxGeometry(0.8, 0.12, 0.3).translate(3.45, 9.36, 0).toNonIndexed(),
    ];
    const lampGeo = track(mergeGeometries(lampParts));
    const lampLensGeo = track(new THREE.BoxGeometry(0.66, 0.02, 0.22).translate(3.45, 9.29, 0));
    const lampPoolMat = track(new THREE.MeshBasicMaterial({ map: lightBlob, color: '#ffcf8a', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    const lampPoolGeo = track(new THREE.PlaneGeometry(11, 15).rotateX(-Math.PI / 2));
    for (let z = Z0; z > Z0 - LEN; z -= PERIOD) {
      const g = new THREE.Group(); g.position.set(poleX, 0, z);
      const pole = new THREE.Mesh(lampGeo, poleMat); pole.castShadow = true;
      const lens = new THREE.Mesh(lampLensGeo, lampLens);
      const pool = new THREE.Mesh(lampPoolGeo, lampPoolMat); pool.position.set(3.45, 0.012, 0);
      g.add(pole, lens, pool); world.add(g);
    }

    // Trees: hand-drawn (procedural) eucalyptus cards on crossed quads, set back from both verges, tiled per PERIOD.
    const rand = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
    const treeTex = (variant: number) => canvasTex(256, 512, (g) => {
      const tips: [number, number, number][] = [];
      const branch = (x: number, y: number, len: number, ang: number, width: number, depth: number) => {
        const x2 = x + Math.cos(ang) * len; const y2 = y - Math.sin(ang) * len;
        g.strokeStyle = depth > 3 ? '#3b3129' : '#2c261f'; g.lineWidth = width; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x2) / 2 + gauss() * len * 0.15, (y + y2) / 2, x2, y2); g.stroke();
        if (depth === 0) { tips.push([x2, y2, len]); return; }
        const n = rand() < 0.35 ? 3 : 2;
        for (let i = 0; i < n; i++) branch(x2, y2, len * (0.6 + rand() * 0.16), ang + (i - (n - 1) / 2) * (0.55 + rand() * 0.35) + gauss() * 0.2, width * 0.66, depth - 1);
      };
      branch(128 + gauss() * 6, 512, 74 + variant * 7, Math.PI / 2 + gauss() * 0.08, 10, 5);
      // Leaf clumps: darker inside/below, catching warm light on the sun side.
      for (let pass = 0; pass < 3; pass++) for (const [x, y, len] of tips) {
        const n = 26 + Math.floor(len * 0.8);
        for (let k = 0; k < n; k++) {
          const lx = Math.min(250, Math.max(6, x + gauss() * 26)); const ly = Math.max(8, y + gauss() * 17 - 6);
          const lit = pass === 2 ? Math.max(0, (lx - 128) / 128 + (256 - ly) / 512) : 0;
          const r = 34 + rand() * 18 + lit * 50; const gg = 44 + rand() * 20 + lit * 38; const b = 26 + rand() * 10 + lit * 10;
          g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
          g.beginPath(); g.ellipse(lx, ly, 2 + rand() * 4.5, 1.5 + rand() * 3, rand() * 3.14, 0, 7); g.fill();
        }
      }
    });
    const card = new THREE.PlaneGeometry(1.1, 2).translate(0, 1, 0);
    const treeGeo = track(mergeGeometries([card.clone(), card.clone().rotateY(Math.PI / 2)]));
    { const n = treeGeo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0.2, 0.9, 0.35); } // soft, even foliage shading
    const tiles = Math.ceil(LEN / PERIOD);
    const perTile = 7;
    const variants = 4;
    const trees = Array.from({ length: variants }, (_, v) => new THREE.InstancedMesh(treeGeo, track(new THREE.MeshStandardMaterial({ map: treeTex(v), alphaTest: 0.3, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 1 })), tiles * perTile * 2));
    const layout: { x: number; z: number; s: number; r: number; kind: number }[] = [];
    for (let k = 0; k < perTile * 2; k++) {
      const near = k < perTile;
      const x = rand() < 0.5 ? roadRight + (near ? 10 : 30) + rand() * (near ? 14 : 70) : railX - (near ? 8 : 26) - rand() * (near ? 14 : 70);
      layout.push({ x, z: rand() * PERIOD, s: 4 + rand() * 3.5, r: rand() * 3.14, kind: Math.floor(rand() * variants) });
    }
    const counts = new Array(variants).fill(0);
    const q = new THREE.Quaternion(); const sc = new THREE.Vector3(); const pos = new THREE.Vector3(); const yAxis = new THREE.Vector3(0, 1, 0);
    for (let t = 0; t < tiles; t++) for (const l of layout) {
      q.setFromAxisAngle(yAxis, l.r); sc.set(l.s, l.s, l.s); pos.set(l.x, -0.1, Z0 - t * PERIOD - l.z);
      trees[l.kind].setMatrixAt(counts[l.kind]++, mtx.compose(pos, q, sc));
    }
    trees.forEach((m, i) => { m.count = counts[i]; world.add(m); });

    // Distant ranges (static: at this distance parallax is negligible)
    const hash = (x: number, y: number) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
    const vnoise = (x: number, y: number) => {
      const xi = Math.floor(x); const yi = Math.floor(y); const xf = x - xi; const yf = y - yi;
      const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
      const a = hash(xi, yi); const b = hash(xi + 1, yi); const c = hash(xi, yi + 1); const d = hash(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x: number, y: number) => { let s = 0; let amp = 1; let f = 1; for (let o = 0; o < 6; o++) { s += amp * vnoise(x * f, y * f); amp *= 0.5; f *= 2; } return s / 1.97; };
    const terrainGeo = track(new THREE.PlaneGeometry(3200, 700, 320, 70));
    terrainGeo.rotateX(-Math.PI / 2);
    const tpos = terrainGeo.attributes.position;
    for (let i = 0; i < tpos.count; i++) {
      const x = tpos.getX(i); const z = tpos.getZ(i);
      const depth = (350 - z) / 700;
      const valley = Math.min(1, Math.abs(x + 60) / 260); // lower where the road disappears
      const ridge = Math.pow(fbm(x / 210 + 3, z / 210), 1.7) * 260;
      tpos.setY(i, Math.max(0, ridge * Math.min(1, depth * 1.6) * (0.35 + 0.65 * valley) - 8));
    }
    terrainGeo.computeVertexNormals();
    const terrain = new THREE.Mesh(terrainGeo, track(new THREE.MeshStandardMaterial({ color: '#23271f', roughness: 1 })));
    terrain.position.set(0, 0, -1000);
    scene.add(terrain);

    // ---------- Cars ----------
    let hero: CarRig | null = null;
    const oncoming: { rig: CarRig; z: number }[] = [];

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const readyTimer = window.setTimeout(() => onReady?.(), 9000);
    const finish = () => { window.clearTimeout(readyTimer); if (!disposed) onReady?.(); };

    loader.load(CAR_URL, (gltf) => {
      const template = gltf.scene;
      const shared = new Set<THREE.Material>();
      template.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true; m.receiveShadow = true;
        track(m.geometry);
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => shared.add(x));
      });
      shared.forEach((x) => {
        track(x);
        const s = x as THREE.MeshStandardMaterial;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) { const t = s[k]; if (t) { t.anisotropy = aniso; track(t); } }
      });
      if (disposed) { disposables.forEach((d) => d.dispose()); return; }
      const byName = (n: string) => [...shared].find((x) => x.name === n) as THREE.MeshPhysicalMaterial | undefined;
      // Tinted, reflective glass (the interior was stripped from the model, so keep it opaque).
      const glass = track(new THREE.MeshPhysicalMaterial({ color: '#07090c', roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 }));
      const head = byName('Headlight'); if (head) { head.emissive = new THREE.Color('#fff4e0'); head.emissiveIntensity = 6; }
      const brake = byName('Brakelight'); if (brake) { brake.emissive = new THREE.Color('#ff1a0a'); brake.emissiveIntensity = 3.5; }
      const flakes = byName('Paint 1 Carmine')?.normalMap ?? null;

      const build = (paint1: string, paint2: string, metal: number, rough: number): CarRig => {
        const root = template.clone(true);
        const p1 = track(new THREE.MeshPhysicalMaterial({ color: paint1, metalness: metal, roughness: rough, clearcoat: 1, clearcoatRoughness: 0.16, normalMap: flakes }));
        p1.normalScale.set(0.15, 0.15);
        const p2 = track(new THREE.MeshPhysicalMaterial({ color: paint2, metalness: 0.4, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }));
        const swap = (x: THREE.Material) => (x.name === 'Glass' ? glass : x.name.startsWith('Paint 1') ? p1 : x.name.startsWith('Paint 2') ? p2 : x);
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
        });
        const wheels: THREE.Object3D[] = [];
        root.traverse((o) => { if (/^Wheel(Front|Rear)[LR]$/.test(o.name)) wheels.push(o); });
        const contact = new THREE.Mesh(track(new THREE.PlaneGeometry(2.9, 5.2)), track(new THREE.MeshBasicMaterial({ map: softBlob, transparent: true, depthWrite: false, opacity: 0.9 })));
        contact.rotation.x = -Math.PI / 2; contact.position.set(0, 0.006, 0.24); contact.renderOrder = -1;
        const rig = new THREE.Group(); rig.add(root, contact);
        return { root: rig, wheels };
      };

      // Hero: deep teal metallic with a gloss-black roof, headlights on.
      hero = build('#13807a', '#0b0d10', 0.45, 0.3);
      scene.add(hero.root);
      for (const x of [-0.62, 0.62]) {
        const spot = new THREE.SpotLight('#fff1dc', 260, 70, 0.34, 0.55, 1.6);
        spot.position.set(x, 0.72, 2.2); spot.target.position.set(x * 1.8, 0, 26);
        hero.root.add(spot, spot.target);
      }
      // Soft light pool thrown ahead of oncoming cars (the hero's own spotlights light the road for real).
      const poolGeo = track(new THREE.PlaneGeometry(5.5, 16));
      const poolMat = track(new THREE.MeshBasicMaterial({ map: lightBlob, color: '#fff0d0', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));

      // Oncoming traffic in the other lane, facing -z.
      const palette: [string, string, number, number][] = [['#b9bec4', '#15171a', 0.9, 0.28], ['#7a0f14', '#0c0c0e', 0.6, 0.3], ['#1c2a44', '#0c0c0e', 0.7, 0.3]];
      palette.forEach((p, i) => {
        const rig = build(...p);
        rig.root.rotation.y = Math.PI;
        const beamPool = new THREE.Mesh(poolGeo, poolMat); // their headlights on the road ahead of them
        beamPool.rotation.x = -Math.PI / 2; beamPool.position.set(0, 0.01, 11);
        rig.root.add(beamPool);
        scene.add(rig.root);
        oncoming.push({ rig, z: 60 + i * 190 });
      });
      finish();
    }, undefined, () => finish());

    // ---------- Post-processing ----------
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.35, 4.0);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, time: { value: 0 }, aspect: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time; uniform float aspect; varying vec2 vUv;
        float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time * 7.0) * 43758.5453); }
        void main(){
          vec2 c = vUv - 0.5; float d = length(c * vec2(aspect, 1.0)) / length(vec2(aspect, 1.0) * 0.5);
          vec2 off = c * 0.0025 * d;                          // slight lens chromatic aberration at the edges
          vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, col * vec3(1.03, 0.96, 1.05), 0.8);   // pull the green out of the twilight sky
          col += vec3(0.0, 0.006, 0.022) * (1.0 - smoothstep(0.0, 0.35, luma)); // cool, lifted shadows
          col *= mix(1.0, 0.62, smoothstep(0.45, 1.15, d));   // vignette
          col += (rnd(vUv * 900.0) - 0.5) * 0.028;            // film grain
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    composer.addPass(grade);
    disposables.push(composer, bloom);

    // ---------- Camera rig & interaction ----------
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => { pointer.tx = e.clientX / window.innerWidth - 0.5; pointer.ty = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener('pointermove', onMove);
    const resize = () => {
      const wpx = host.clientWidth; const hpx = host.clientHeight;
      renderer.setSize(wpx, hpx, false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(wpx, hpx);
      camera.aspect = wpx / hpx;
      camera.fov = camera.aspect < 0.8 ? 40 : 30;
      camera.updateProjectionMatrix();
      grade.uniforms.aspect.value = camera.aspect;
    };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();

    const carCenter = new THREE.Vector3(0, 0.55, 0.24);
    const target = new THREE.Vector3(); const right = new THREE.Vector3();
    let dist = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      const heroMove = reduceMotion ? 0 : HERO_SPEED * dt;
      dist += heroMove;
      world.position.z = -(dist % PERIOD);

      const spin = reduceMotion ? 0 : Math.min(HERO_SPEED / 0.384, 30) * dt; // capped to avoid wagon-wheel strobing
      if (hero) {
        hero.wheels.forEach((w) => { w.rotation.x += spin; });
        // Subtle suspension float and pitch.
        hero.root.position.y = (Math.sin(t * 9.1) * 0.5 + Math.sin(t * 13.7) * 0.3) * 0.0035;
        hero.root.rotation.x = Math.sin(t * 1.7) * 0.0022;
        hero.root.rotation.z = Math.sin(t * 1.1) * 0.0018;
      }
      for (const o of oncoming) {
        if (!reduceMotion) o.z -= (HERO_SPEED + ONCOMING_SPEED) * dt;
        if (o.z < -520) o.z += 3 * 190;
        o.rig.root.position.set(-LANE, 0, o.z);
        o.rig.wheels.forEach((w) => { w.rotation.x += spin; });
      }

      // Tracking-car camera: slow arc around the front three-quarter, a little hand-held float.
      pointer.x += (pointer.tx - pointer.x) * 0.04; pointer.y += (pointer.ty - pointer.y) * 0.04;
      const narrow = camera.aspect < 0.8;
      const drift = reduceMotion ? 0 : Math.sin(t * 0.06);
      const shake = reduceMotion ? 0 : 1;
      const angle = (narrow ? 0.42 : 0.62) + drift * 0.2 + pointer.x * 0.18;
      const radius = narrow ? 12.5 : 10.4;
      camera.position.set(
        Math.sin(angle) * radius + Math.sin(t * 1.9) * 0.01 * shake,
        (narrow ? 1.7 : 1.05) - pointer.y * 0.5 + Math.sin(t * 2.3) * 0.012 * shake,
        Math.cos(angle) * radius,
      ).add(carCenter);
      right.set(Math.cos(angle), 0, -Math.sin(angle));
      target.copy(carCenter).addScaledVector(right, narrow ? 0 : 1.15);
      target.y = narrow ? -1.3 : 0.85;
      camera.lookAt(target);

      grade.uniforms.time.value = t % 100;
      sky.material.uniforms.time.value = t;
      composer.render(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      disposed = true;
      window.clearTimeout(readyTimer);
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      ro.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [onReady]);

  return <div ref={mount} className="scene3d" aria-hidden />;
}
