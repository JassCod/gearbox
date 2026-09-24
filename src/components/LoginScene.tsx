import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * A real-time 3D dusk highway: a Torqline truck drives towards the viewer while
 * street lights, lane markings and oncoming traffic stream past. Everything is
 * procedural (no image assets), lit with physically based materials.
 */
export default function LoginScene({ onReady }: { onReady?: () => void }) {
  const mount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      return; // No WebGL – the CSS backdrop behind the canvas stays visible.
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const fogColor = new THREE.Color('#3b3350');
    scene.fog = new THREE.FogExp2(fogColor, 0.0085);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 1500);
    const disposables: { dispose(): void }[] = [pmrem];
    const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

    // ---------- Sky ----------
    const sunDir = new THREE.Vector3(0.35, 0.06, -1).normalize();
    const sky = new THREE.Mesh(
      track(new THREE.SphereGeometry(900, 48, 24)),
      track(new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { sunDir: { value: sunDir } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `
          varying vec3 vDir; uniform vec3 sunDir;
          void main(){
            float h = clamp(vDir.y, -0.2, 1.0);
            vec3 zenith = vec3(0.05, 0.07, 0.18);
            vec3 mid = vec3(0.30, 0.20, 0.42);
            vec3 horizon = vec3(1.0, 0.52, 0.25);
            vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
            col = mix(col, zenith, smoothstep(0.15, 0.7, h));
            float s = max(dot(normalize(vDir), sunDir), 0.0);
            col += vec3(1.0, 0.6, 0.3) * pow(s, 8.0) * 0.55 + vec3(1.0, 0.85, 0.6) * pow(s, 900.0) * 3.0;
            col = mix(col, vec3(0.23, 0.2, 0.31), smoothstep(0.0, -0.2, h));
            gl_FragColor = vec4(col, 1.0);
          }`,
      })),
    );
    scene.add(sky);

    const stars = new THREE.BufferGeometry();
    const starPos: number[] = [];
    for (let i = 0; i < 900; i++) {
      const th = Math.random() * Math.PI * 2; const ph = Math.acos(1 - Math.random() * 0.9);
      starPos.push(800 * Math.sin(ph) * Math.cos(th), 800 * Math.cos(ph) + 40, 800 * Math.sin(ph) * Math.sin(th));
    }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const starMat = track(new THREE.PointsMaterial({ color: '#dfe7ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false }));
    scene.add(new THREE.Points(track(stars), starMat));

    // ---------- Lights ----------
    scene.add(new THREE.HemisphereLight('#8c7fb8', '#2a2018', 0.9));
    const sun = new THREE.DirectionalLight('#ffb27a', 2.6);
    sun.position.copy(sunDir).multiplyScalar(60).add(new THREE.Vector3(0, 8, 0));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 140 });
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    // ---------- Helpers ----------
    const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d')!);
      const t = track(new THREE.CanvasTexture(c));
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    };
    const glowTex = canvasTex(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    });
    const glow = (color: string, size: number, opacity = 1) => {
      const m = track(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false }));
      const s = new THREE.Sprite(m); s.scale.setScalar(size); return s;
    };
    const mat = {
      paint: track(new THREE.MeshPhysicalMaterial({ color: '#0e6f68', metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 })),
      chrome: track(new THREE.MeshStandardMaterial({ color: '#e8edf2', metalness: 1, roughness: 0.12 })),
      glass: track(new THREE.MeshPhysicalMaterial({ color: '#0b1220', metalness: 0.2, roughness: 0.05, clearcoat: 1, reflectivity: 1 })),
      rubber: track(new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92 })),
      dark: track(new THREE.MeshStandardMaterial({ color: '#1b1e22', roughness: 0.7, metalness: 0.3 })),
      rim: track(new THREE.MeshStandardMaterial({ color: '#c9d1d9', metalness: 0.9, roughness: 0.25 })),
      headlight: track(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 6 })),
      amber: track(new THREE.MeshStandardMaterial({ color: '#ffb000', emissive: '#ff9d00', emissiveIntensity: 4 })),
      red: track(new THREE.MeshStandardMaterial({ color: '#ff2a2a', emissive: '#ff1a1a', emissiveIntensity: 3 })),
    };

    // ---------- Road & ground ----------
    const roadTex = canvasTex(512, 2048, (g) => {
      g.fillStyle = '#232428'; g.fillRect(0, 0, 512, 2048);
      const img = g.getImageData(0, 0, 512, 2048);
      for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 26; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
      g.putImageData(img, 0, 0);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(150, 0, 60, 2048); g.fillRect(330, 0, 60, 2048); // tyre wear
      g.fillStyle = '#e9e5d8'; g.fillRect(18, 0, 10, 2048); g.fillRect(484, 0, 10, 2048);
      g.fillStyle = '#f2c14e'; for (let y = 0; y < 2048; y += 256) g.fillRect(251, y, 10, 150);
    });
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, 18);
    const roadLen = 700;
    const road = new THREE.Mesh(track(new THREE.PlaneGeometry(14, roadLen)), track(new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.38, metalness: 0.1 })));
    road.rotation.x = -Math.PI / 2; road.position.set(-1.9, 0.01, -roadLen / 2 + 40); road.receiveShadow = true;
    scene.add(road);
    const groundTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#5a4d36'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 5000; i++) { g.fillStyle = Math.random() < 0.35 ? `rgba(${70 + Math.random() * 30},${80 + Math.random() * 30},${40 + Math.random() * 20},.7)` : `rgba(${95 + Math.random() * 40},${80 + Math.random() * 30},${55 + Math.random() * 20},.5)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    });
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.repeat.set(160, 160);
    const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(2000, 2000)), track(new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 })));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);
    const shoulderMat = track(new THREE.MeshStandardMaterial({ color: '#6b6150', roughness: 1 }));
    for (const x of [-9.9, 6.1]) {
      const sh = new THREE.Mesh(track(new THREE.PlaneGeometry(2, roadLen)), shoulderMat);
      sh.rotation.x = -Math.PI / 2; sh.position.set(x, 0.008, -roadLen / 2 + 40); sh.receiveShadow = true; scene.add(sh);
    }
    // Barrier along the left side
    const rail = new THREE.Mesh(track(new THREE.BoxGeometry(0.12, 0.35, roadLen)), mat.rim);
    rail.position.set(-9.2, 0.6, -roadLen / 2 + 40); scene.add(rail);

    // Mountain range: a noise-displaced terrain strip on the horizon.
    const hash = (x: number, y: number) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
    const vnoise = (x: number, y: number) => {
      const xi = Math.floor(x); const yi = Math.floor(y); const xf = x - xi; const yf = y - yi;
      const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
      const a = hash(xi, yi); const b = hash(xi + 1, yi); const c = hash(xi, yi + 1); const d = hash(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x: number, y: number) => { let s = 0; let amp = 1; let f = 1; for (let o = 0; o < 5; o++) { s += amp * vnoise(x * f, y * f); amp *= 0.5; f *= 2; } return s / 1.94; };
    const terrainGeo = track(new THREE.PlaneGeometry(2400, 520, 240, 60));
    terrainGeo.rotateX(-Math.PI / 2);
    const tpos = terrainGeo.attributes.position;
    for (let i = 0; i < tpos.count; i++) {
      const x = tpos.getX(i); const z = tpos.getZ(i);
      const depth = (260 - z) / 520; // 0 at the near edge, 1 at the far edge
      const ridge = Math.pow(fbm(x / 170 + 3, z / 170), 1.6) * 210;
      tpos.setY(i, Math.max(0, ridge * Math.min(1, depth * 1.8) - 6));
    }
    terrainGeo.computeVertexNormals();
    const terrain = new THREE.Mesh(terrainGeo, track(new THREE.MeshStandardMaterial({ color: '#3d3450', roughness: 1, flatShading: true })));
    terrain.position.set(0, 0, -640);
    scene.add(terrain);
    // Distant town lights
    const town = new THREE.BufferGeometry();
    const tp: number[] = [];
    for (let i = 0; i < 400; i++) tp.push(-260 + Math.random() * 380, 0.5 + Math.random() * 6, -330 - Math.random() * 60);
    town.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    scene.add(new THREE.Points(track(town), track(new THREE.PointsMaterial({ color: '#ffcf8a', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.9 }))));

    // ---------- Truck ----------
    const truck = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = truck) => {
      const mesh = new THREE.Mesh(track(geo), m); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    // Chassis
    add(new THREE.BoxGeometry(1.1, 0.35, 16.5), mat.dark, 0, 0.75, -1.6);
    // Cab + sleeper
    add(new RoundedBoxGeometry(2.5, 2.7, 2.4, 5, 0.22), mat.paint, 0, 2.35, 3.7);
    add(new RoundedBoxGeometry(2.46, 3.05, 1.7, 5, 0.2), mat.paint, 0, 2.55, 1.85);
    add(new RoundedBoxGeometry(2.3, 0.5, 1.6, 4, 0.2), mat.paint, 0, 4.15, 2.3); // roof fairing
    // Long hood
    const hood = add(new RoundedBoxGeometry(2.1, 1.25, 2.1, 5, 0.3), mat.paint, 0, 1.8, 5.95);
    hood.scale.set(1, 1, 1);
    // Windshield & side windows
    const ws = add(new THREE.BoxGeometry(2.2, 1.0, 0.06), mat.glass, 0, 3.05, 4.93); ws.rotation.x = -0.18;
    add(new THREE.BoxGeometry(0.06, 0.85, 1.3), mat.glass, -1.26, 3.0, 3.9);
    add(new THREE.BoxGeometry(0.06, 0.85, 1.3), mat.glass, 1.26, 3.0, 3.9);
    // Grille, bumper, visor
    const grille = add(new THREE.BoxGeometry(1.35, 1.05, 0.08), mat.chrome, 0, 1.75, 7.0);
    for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(1.25, 0.04, 0.04), mat.dark, 0, 1.33 + i * 0.14, 7.05);
    void grille;
    add(new RoundedBoxGeometry(2.6, 0.38, 0.45, 3, 0.12), mat.chrome, 0, 0.95, 7.05);
    add(new THREE.BoxGeometry(2.3, 0.08, 0.35), mat.paint, 0, 3.62, 5.0);
    // Headlights + fog lights + beams
    for (const x of [-0.9, 0.9]) {
      add(new RoundedBoxGeometry(0.42, 0.24, 0.1, 2, 0.05), mat.headlight, x, 1.55, 7.02);
      const g = glow('#fff2d0', 2.2); g.position.set(x, 1.55, 7.2); truck.add(g);
      add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16).rotateX(Math.PI / 2), mat.amber, x * 1.08, 0.95, 7.3);
      const beam = new THREE.SpotLight('#fff1d6', 120, 70, 0.45, 0.55, 1.4);
      beam.position.set(x, 1.55, 7.1); beam.target.position.set(x * 1.6, 0, 30);
      truck.add(beam, beam.target);
    }
    // Light shafts: long additive cones fading with distance, visible in the dusk haze.
    // Soft edges: fade by how side-on the cone surface is to the camera, and along its length.
    const shaftMat = track(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color('#ffefcc') }, opacity: { value: 0.22 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = uv.y; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 color; uniform float opacity; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2); float len = pow(vY, 1.6); gl_FragColor = vec4(color, edge * len * opacity); }',
    }));
    for (const x of [-0.9, 0.9]) {
      const shaft = new THREE.Mesh(track(new THREE.CylinderGeometry(0.2, 3.2, 26, 24, 1, true)), shaftMat);
      shaft.rotation.x = Math.PI / 2; shaft.rotation.z = x * 0.02;
      shaft.position.set(x * 1.3, 1.25, 7.1 + 13);
      truck.add(shaft);
    }
    // Roof marker lights
    for (let i = -2; i <= 2; i++) { add(new THREE.SphereGeometry(0.06, 10, 8), mat.amber, i * 0.35, 4.43, 3.0); const g = glow('#ffae00', 0.45, 0.9); g.position.set(i * 0.35, 4.43, 3.1); truck.add(g); }
    // Mirrors & exhaust stacks
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.06, 0.06, 0.6), mat.chrome, s * 1.45, 2.95, 4.7).rotation.y = s * 0.3;
      add(new RoundedBoxGeometry(0.14, 0.55, 0.28, 2, 0.04), mat.chrome, s * 1.62, 2.95, 4.95);
      add(new THREE.CylinderGeometry(0.11, 0.11, 3.2, 20), mat.chrome, s * 1.3, 3.1, 2.75);
      add(new THREE.BoxGeometry(0.5, 0.5, 1.4), mat.chrome, s * 1.0, 1.05, 2.4); // fuel tanks
    }
    // Trailer with livery
    const livery = canvasTex(2048, 512, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 512); grad.addColorStop(0, '#f4f6f8'); grad.addColorStop(1, '#d7dde3'); g.fillStyle = grad; g.fillRect(0, 0, 2048, 512);
      g.fillStyle = '#0e6f68'; g.fillRect(0, 380, 2048, 60); g.fillStyle = '#f59e0b'; g.fillRect(0, 440, 2048, 14);
      g.fillStyle = '#0b3b37'; g.font = '800 200px Inter, system-ui, sans-serif'; g.fillText('TORQLINE', 120, 280);
      g.fillStyle = '#35505a'; g.font = '600 56px Inter, system-ui, sans-serif'; g.fillText('Fleet maintenance & compliance', 130, 350);
      g.strokeStyle = 'rgba(0,0,0,.06)'; g.lineWidth = 3; for (let x = 0; x < 2048; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 380); g.stroke(); }
    });
    const liveryFlip = livery.clone(); liveryFlip.wrapS = THREE.RepeatWrapping; liveryFlip.repeat.x = -1; liveryFlip.needsUpdate = true; track(liveryFlip);
    const plain = track(new THREE.MeshStandardMaterial({ color: '#e6eaee', roughness: 0.45, metalness: 0.25 }));
    const trailer = new THREE.Mesh(track(new RoundedBoxGeometry(2.6, 3.1, 12.2, 3, 0.08)), [
      track(new THREE.MeshStandardMaterial({ map: liveryFlip, roughness: 0.45, metalness: 0.2 })),
      track(new THREE.MeshStandardMaterial({ map: livery, roughness: 0.45, metalness: 0.2 })),
      plain, plain, plain, plain,
    ]);
    trailer.position.set(0, 2.75, -5.05); trailer.castShadow = true; trailer.receiveShadow = true; truck.add(trailer);
    add(new THREE.BoxGeometry(2.4, 0.3, 11.5), mat.dark, 0, 1.08, -5.2);
    for (const x of [-1.25, 1.25]) for (let z = -10.9; z < 1; z += 1.6) { add(new THREE.SphereGeometry(0.035, 6, 6), mat.amber, x * 1.05, 1.05, z); }
    for (const x of [-1.05, 1.05]) { add(new THREE.BoxGeometry(0.3, 0.15, 0.05), mat.red, x, 1.25, -11.2); }
    // Wheels
    const wheels: THREE.Group[] = [];
    const tyreGeo = new THREE.CylinderGeometry(0.53, 0.53, 0.34, 40).rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.36, 24).rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.4, 12).rotateZ(Math.PI / 2);
    track(tyreGeo); track(rimGeo); track(hubGeo);
    for (const z of [6.0, 1.9, 0.5, -8.4, -9.8]) {
      for (const x of [-1.12, 1.12]) {
        const w = new THREE.Group(); w.position.set(x, 0.53, z);
        const tyre = new THREE.Mesh(tyreGeo, mat.rubber); tyre.castShadow = true; w.add(tyre);
        w.add(new THREE.Mesh(rimGeo, mat.rim), new THREE.Mesh(hubGeo, mat.chrome));
        for (let k = 0; k < 6; k++) { const nut = new THREE.Mesh(track(new THREE.BoxGeometry(0.4, 0.05, 0.05)), mat.chrome); nut.position.set(0, Math.cos(k) * 0.18, Math.sin(k) * 0.18); w.add(nut); }
        truck.add(w); wheels.push(w);
      }
    }
    // Soft contact shadow
    const shadowTex = canvasTex(128, 256, (g) => {
      const r = g.createRadialGradient(64, 128, 10, 64, 128, 128); r.addColorStop(0, 'rgba(0,0,0,.65)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 256);
    });
    const contact = new THREE.Mesh(track(new THREE.PlaneGeometry(4.4, 21)), track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })));
    contact.rotation.x = -Math.PI / 2; contact.position.set(0, 0.02, -1.8); truck.add(contact);
    truck.position.set(0, 0, 0);
    scene.add(truck);
    // Light pool the headlights throw ahead on the road
    const pool = new THREE.Mesh(track(new THREE.PlaneGeometry(7, 22)), track(new THREE.MeshBasicMaterial({ map: shadowTex, color: '#fff1c9', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })));
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.03, 17); scene.add(pool);

    // ---------- Street lights ----------
    const lamps: THREE.Group[] = [];
    const poleMat = track(new THREE.MeshStandardMaterial({ color: '#4b5563', metalness: 0.7, roughness: 0.4 }));
    const lampHead = track(new THREE.MeshStandardMaterial({ color: '#ffe3a3', emissive: '#ffc86b', emissiveIntensity: 5 }));
    const lampPoolMat = track(new THREE.MeshBasicMaterial({ map: shadowTex, color: '#ffc877', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    const spacing = 34;
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.14, 9, 10)), poleMat); pole.position.set(0, 4.5, 0); pole.castShadow = true;
      const arm = new THREE.Mesh(track(new THREE.BoxGeometry(2.6, 0.1, 0.1)), poleMat); arm.position.set(-1.3, 8.9, 0);
      const head = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, 0.14, 0.32)), lampHead); head.position.set(-2.5, 8.8, 0);
      const halo = glow('#ffcf7a', 3.4, 0.85); halo.position.set(-2.5, 8.6, 0);
      const lp = new THREE.Mesh(track(new THREE.PlaneGeometry(9, 12)), lampPoolMat); lp.rotation.x = -Math.PI / 2; lp.position.set(-3.2, 0.04 - 0, 0);
      g.add(pole, arm, head, halo, lp);
      g.position.set(5.7, 0, 30 - i * spacing);
      scene.add(g); lamps.push(g);
    }

    // ---------- Oncoming traffic (headlight pairs) ----------
    const cars: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Group();
      for (const x of [-0.7, 0.7]) { const g = glow('#fff6de', 1.6); g.position.set(x, 0.8, 0); c.add(g); }
      const body = new THREE.Mesh(track(new RoundedBoxGeometry(1.9, 1.3, 4.4, 3, 0.35)), track(new THREE.MeshStandardMaterial({ color: ['#1f2937', '#7f1d1d', '#334155'][i], metalness: 0.6, roughness: 0.35 })));
      body.position.set(0, 0.8, -2.2); body.castShadow = true; c.add(body);
      c.position.set(-5.6, 0, -140 - i * 160);
      scene.add(c); cars.push(c);
    }

    // ---------- Camera rig & interaction ----------
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => { pointer.tx = e.clientX / window.innerWidth - 0.5; pointer.ty = e.clientY / window.innerHeight - 0.5; };
    window.addEventListener('pointermove', onMove);
    const target = new THREE.Vector3();
    const resize = () => {
      const w = host.clientWidth; const h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Narrow screens: pull back and frame the truck higher so the form fits below.
      camera.fov = w / h < 0.8 ? 52 : 34;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();

    const speed = 22; // m/s ≈ 80 km/h
    let last = performance.now();
    let raf = 0;
    let first = true;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      const move = reduceMotion ? 0 : speed * dt;
      roadTex.offset.y -= (move / roadLen) * roadTex.repeat.y;
      for (const w of wheels) w.rotation.x += move / 0.53;
      for (const l of lamps) { l.position.z -= move; if (l.position.z < -380) l.position.z += spacing * lamps.length; }
      for (const c of cars) { c.position.z += move * 2.2; if (c.position.z > 40) c.position.z -= 480; }
      truck.position.y = Math.sin(t * 7) * 0.012;
      truck.rotation.z = Math.sin(t * 1.3) * 0.006;
      pointer.x += (pointer.tx - pointer.x) * 0.04; pointer.y += (pointer.ty - pointer.y) * 0.04;
      const narrow = camera.aspect < 0.8;
      const sway = reduceMotion ? 0 : Math.sin(t * 0.12);
      camera.position.set(-10.5 + sway * 1.4 + pointer.x * 3, 1.7 - pointer.y * 1.0 + (narrow ? 2.5 : 0), 22 + (narrow ? 10 : 0) + Math.cos(t * 0.1) * 0.8);
      target.set((narrow ? 0.6 : 5.8) + pointer.x * 1.2, narrow ? -2.6 : 3.4, narrow ? -1 : 0);
      camera.lookAt(target);
      renderer.render(scene, camera);
      if (first) { first = false; onReady?.(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onVis = () => { if (document.hidden) cancelAnimationFrame(raf); else { last = performance.now(); raf = requestAnimationFrame(tick); } };
    document.addEventListener('visibilitychange', onVis);

    return () => {
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
