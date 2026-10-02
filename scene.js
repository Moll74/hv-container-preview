// Photoreal scroll scene for the containerudlejning.dk mockup.
// Hero: HV-transport's own photo of a delivery; the 3D container is solved into its camera (PnP on the container corners).
// Hero: HV's truck cut out of their photo and placed on a villa street; villa steps: photoreal backdrop with a solved camera.
// Container paint wear: Poly Haven "container_side" (CC0). Boxes: Poly Haven "cardboard_box_01" (CC0).
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ss = (k, a, b) => { const t = clamp((k - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('stage');
const loaderEl = document.getElementById('loader');
const barEl = document.getElementById('loader-bar');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  document.body.classList.add('no3d');
  loaderEl && loaderEl.remove();
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

const scene = new THREE.Scene();
renderer.setClearColor(0x000000, 0);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);

/* ---------- loading ---------- */
const manager = new THREE.LoadingManager();
manager.onProgress = (_u, loaded, total) => { if (barEl) barEl.style.width = Math.round(loaded / total * 100) + '%'; };
let ready = false;
manager.onLoad = () => { ready = true; };
const texLoader = new THREE.TextureLoader(manager);
const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
function tex(url, srgb) {
  const t = texLoader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- environment ---------- */
// photo plate (HV-transport, Herning) and the camera solved from it
const PHOTO = { w: 640, h: 480, fovY: 64.551, pos: new THREE.Vector3(7.8473, 1.4645, -5.0148), quat: new THREE.Quaternion(0.02433, 0.94799, -0.0483, 0.31368), anchor: [452, 196] };
const HANG = 1.6; // container bottom above the sand in the photo
const plateEl = document.getElementById('plate'), dipEl = document.getElementById('dip');
new RGBELoader(manager).load('assets/sky_1k.hdr', h => { h.mapping = THREE.EquirectangularReflectionMapping; scene.environment = h; });
// Villa scene: AI-generated photoreal backdrop (Gamma, inspired by new-build villa areas in Herning), camera solved from the paver grid
// hero: HV's truck cut out onto a clean studio backdrop, the container sitting on its flatbed (same solved camera)
const HQ = new URLSearchParams(location.search);
const HERO = { pos: new THREE.Vector3(+(HQ.get('hx') ?? 0.765), +(HQ.get('hy') ?? 0.918), +(HQ.get('hz') ?? 4.042)), yaw: +(HQ.get('hyaw') ?? 2.686), center: [235, 290] };
const CONT_YAW = +(new URLSearchParams(location.search).get('yaw') ?? 0); // container stands straight, parallel to the garage front
// each page describes its own photo plate: villa street (private) or building site (erhverv); defaults = villa
const CFG = window.SCENE_CFG || {};
const VILLA = { w: 2752, h: 1536, fovY: CFG.fovY ?? 30.887, pos: new THREE.Vector3(...(CFG.camPos ?? [5.3, 4.26, 32.298])), quat: new THREE.Quaternion(...(CFG.camQuat ?? [-0.09025, 0, 0, 0.99592])), anchor: [1376, 768] };
const PLATE_ZOOM = CFG.zoom ?? 1, PLATE_ANCHOR = CFG.anchor ?? [1376, 768];   // tighter framing = longer lens: photo and 3D zoom together
const CONT_END_YAW = CFG.contYaw ?? 0;   // lines the container up with the kerb of the yard / driveway in the photo
const PLATE_URL = CFG.plate ?? 'assets/villa_drive.jpg', FIELD_ROW = CFG.fieldRow ?? 872, SUN_OFS = CFG.sun ?? [13, 10, -5.2], MOBILE_AX = CFG.mobileAx ?? 0.2;
const hood = new THREE.Group();

// soft daylight "sun" through thin cloud, matched to the bright patch in the HDRI
const sun = new THREE.DirectionalLight(0xffe6c8, 2.6);   // warm evening key, like the plate
sun.position.set(26, 40, -22);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
sun.shadow.radius = 9; sun.shadow.blurSamples = 16; scene.add(sun.target); sun.shadow.bias = -0.0005;
scene.add(sun);

const catcher = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.4, color: new THREE.Color(0x0d1624) }));   // cool sky-filled shadow, density matched to the hedge shadows in the plate
catcher.rotation.x = -Math.PI / 2; catcher.position.y = 0.004; catcher.receiveShadow = true; scene.add(catcher);

// contact shadow (ambient occlusion where the container meets the paving)
const blob = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.55, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.7), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: .6, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.006; m.renderOrder = 1; scene.add(m); return m;
})();

/* ---------- materials ---------- */
const TILE = 1.95; // one texture tile ≈ 7 corrugations on a real 20 ft side
const detail = tex('assets/cs_detail.jpg', true), nor = tex('assets/cs_nor_gl.jpg'), arm = tex('assets/cs_arm.jpg');
const RED = new THREE.Color('#8e2a1e'), RED_F = new THREE.Color('#6d1f16');
const WHITE = new THREE.Color('#e9e9e4'), WHITE_F = new THREE.Color('#cfd0cb');
const paint = new THREE.MeshStandardMaterial({
  color: RED.clone(), map: detail, normalMap: nor, normalScale: new THREE.Vector2(0.45, 0.45),
  roughnessMap: arm, metalnessMap: arm, aoMap: arm, roughness: 1, metalness: 0.55, side: THREE.DoubleSide,
});
const framePaint = new THREE.MeshStandardMaterial({ color: RED_F.clone(), map: detail, roughnessMap: arm, roughness: 0.9, metalness: 0.35 });
const galv = new THREE.MeshStandardMaterial({ color: 0xb4b9bc, roughness: 0.38, metalness: 1 });
const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.6, metalness: 0.7 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 0.85, map: detail });
const castM = new THREE.MeshStandardMaterial({ color: 0x5b5f62, roughness: 0.7, metalness: 0.6 });

function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }
function rbox(w, h, d, mat, x, y, z, parent, r = 0.012) {
  const m = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), mat));
  m.position.set(x, y, z); if (parent) parent.add(m); return m;
}

// Trapezoidal corrugated sheet facing +z. UVs in texture tiles so the normal map keeps real scale.
function corrugated(len, h, pitch = 0.2786, amp = 0.036) {
  const n = Math.max(1, Math.round(len / pitch)), p = len / n, pts = [];
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + i * p;
    pts.push([x, 0], [x + p * .18, amp], [x + p * .5, amp], [x + p * .68, 0]);
  }
  pts.push([len / 2, 0]);
  const pos = [], norm = [], uv = [], idx = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l, b = pos.length / 3;
    pos.push(x0, 0, z0, x1, 0, z1, x1, h, z1, x0, h, z0);
    for (let k = 0; k < 4; k++) norm.push(nx, 0, nz);
    uv.push(x0 / TILE, 0, x1 / TILE, 0, x1 / TILE, h / TILE, x0 / TILE, h / TILE);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t;
}

/* ---------- 20 ft container (ISO 668: 6058 × 2438 × 2591 mm) ---------- */
const L = 6.058, W = 2.438, H = 2.591;
const cont = new THREE.Group(); scene.add(cont);
const body = new THREE.Group(); cont.add(body);
const AMP = 0.036;

const sideGeo = corrugated(L - 0.34, H - 0.3);
const sideA = shadowed(new THREE.Mesh(sideGeo, paint)); sideA.position.set(0, 0.15, W / 2 - AMP - 0.01); body.add(sideA);
const sideB = shadowed(new THREE.Mesh(sideGeo, paint)); sideB.rotation.y = Math.PI; sideB.position.set(0, 0.15, -(W / 2 - AMP - 0.01)); body.add(sideB);
const front = shadowed(new THREE.Mesh(corrugated(W - 0.34, H - 0.3, 0.28, 0.03), paint));
front.rotation.y = -Math.PI / 2; front.position.set(-(L / 2 - 0.04), 0.15, 0); body.add(front);
const roof = shadowed(new THREE.Mesh(corrugated(L - 0.2, W - 0.2, 0.5, 0.016), paint));
roof.rotation.x = -Math.PI / 2; roof.position.set(0, H - 0.05, (W - 0.2) / 2); body.add(roof);
rbox(L - 0.2, 0.03, W - 0.2, wood, 0, 0.16, 0, body, 0.004); // plywood floor

// frame: corner posts, rails, castings, forklift pockets
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  rbox(0.17, H, 0.17, framePaint, sx * (L / 2 - 0.085), H / 2, sz * (W / 2 - 0.085), body, 0.02);
  for (const y of [0.059, H - 0.059]) rbox(0.178, 0.118, 0.162, castM, sx * (L / 2 - 0.089), y, sz * (W / 2 - 0.081), body, 0.015);
}
for (const sz of [-1, 1]) {
  rbox(L - 0.3, 0.12, 0.12, framePaint, 0, H - 0.07, sz * (W / 2 - 0.06), body);
  rbox(L - 0.3, 0.16, 0.14, framePaint, 0, 0.09, sz * (W / 2 - 0.07), body);
}
for (const sx of [-1, 1]) {
  rbox(0.14, 0.2, W - 0.3, framePaint, sx * (L / 2 - 0.07), H - 0.1, 0, body);
  rbox(0.14, 0.22, W - 0.3, framePaint, sx * (L / 2 - 0.07), 0.11, 0, body);
}
for (const x of [-1.03, 1.03]) {
  rbox(0.36, 0.12, W + 0.004, framePaint, x, 0.09, 0, body);
  for (const sz of [-1, 1]) { const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.08), rubber); hole.position.set(x, 0.09, sz * (W / 2 + 0.004)); hole.rotation.y = sz < 0 ? Math.PI : 0; body.add(hole); }
}

/* doors with locking gear */
const doorH = H - 0.32, doorW = W / 2 - 0.1, doors = [];
const markRight = canvasTex(1024, 512, (g, w, h) => {
  g.fillStyle = '#fff'; g.font = '700 150px Arial, Helvetica, sans-serif'; g.textBaseline = 'top';
  g.fillText('HVTU', 40, 30); g.fillText('201946 3', 40, 190);
  g.font = '700 110px Arial, Helvetica, sans-serif'; g.fillText('22G1', 40, 360);
});
const markLeft = canvasTex(1024, 512, (g) => {
  g.fillStyle = '#fff'; g.textBaseline = 'top';
  const rows = [['MAX. GROSS', '30.480 KG'], ['', '67.200 LB'], ['TARE', '2.230 KG'], ['', '4.920 LB'], ['NET', '28.250 KG'], ['CU. CAP.', '33,2 CU.M']];
  g.font = '700 60px Arial, Helvetica, sans-serif';
  rows.forEach(([a, b], i) => { g.fillText(a, 30, 20 + i * 80); g.fillText(b, 470, 20 + i * 80); });
});
const markMats = [];
for (const sz of [1, -1]) {
  const piv = new THREE.Group(); piv.position.set(L / 2 - 0.03, 0.16, sz * (W / 2 - 0.1)); cont.add(piv);
  const leaf = new THREE.Group(); leaf.position.set(0, 0, -sz * doorW / 2); piv.add(leaf);
  const panel = shadowed(new THREE.Mesh(corrugated(doorW - 0.1, doorH - 0.2, 0.25, 0.028), paint));
  panel.rotation.y = Math.PI / 2; panel.position.set(0, 0.1, 0); leaf.add(panel);
  // door frame
  rbox(0.06, 0.1, doorW, framePaint, 0.02, 0.05, 0, leaf); rbox(0.06, 0.1, doorW, framePaint, 0.02, doorH - 0.05, 0, leaf);
  rbox(0.06, doorH, 0.06, framePaint, 0.02, doorH / 2, sz * (doorW / 2 - 0.03), leaf); rbox(0.06, doorH, 0.06, framePaint, 0.02, doorH / 2, -sz * (doorW / 2 - 0.03), leaf);
  rbox(0.02, doorH, 0.04, rubber, 0.0, doorH / 2, -sz * (doorW / 2 + 0.005), leaf, 0.006);
  // two lock rods per leaf, galvanised, with brackets, cams and handles
  for (const o of [-0.26, 0.26]) {
    const z = o * doorW * 1.3;
    const rod = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, doorH + 0.12, 14), galv)); rod.position.set(0.1, doorH / 2, z); leaf.add(rod);
    for (const y of [0.35, doorH / 2 + 0.35, doorH - 0.35]) rbox(0.07, 0.05, 0.09, galv, 0.08, y, z, leaf, 0.008);
    for (const y of [-0.02, doorH + 0.02]) rbox(0.06, 0.07, 0.1, galv, 0.1, y, z + 0.03, leaf, 0.01);
    const handle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 10), galv));
    handle.rotation.x = Math.PI / 2; handle.position.set(0.14, doorH * 0.43, z + sz * 0.2); leaf.add(handle);
    rbox(0.05, 0.12, 0.05, galv, 0.13, doorH * 0.43, z + sz * 0.4, leaf, 0.01);
  }
  for (const y of [0.3, 0.95, 1.6, doorH - 0.25]) {
    const hinge = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 12), galv)); hinge.position.set(0.02, y, sz * (doorW / 2 + 0.03)); leaf.add(hinge);
  }
  // ISO markings
  const mm = new THREE.MeshStandardMaterial({ map: sz > 0 ? markLeft : markRight, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4 });
  markMats.push(mm);
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(sz > 0 ? 0.62 : 0.7, sz > 0 ? 0.31 : 0.35), mm);
  mark.rotation.y = Math.PI / 2; mark.position.set(0.034, sz > 0 ? doorH - 0.42 : doorH - 0.4, sz > 0 ? 0.05 : -0.02); leaf.add(mark);
  if (sz > 0) { const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), galv); plate.rotation.y = Math.PI / 2; plate.position.set(0.034, 1.0, 0.12); leaf.add(plate); }
  doors.push({ piv, sz });
}

/* HV livery projected onto the corrugation (decal follows the ribs) */
const decalMats = [];
function addDecal(target, map, pos, size) {
  target.updateMatrixWorld(true);
  const g = new DecalGeometry(target, pos, new THREE.Euler(0, 0, 0), size);
  const m = new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.55, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  decalMats.push(m);
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; body.add(mesh);
}
const logoTex = tex('img/logo-white.png', true); logoTex.wrapS = logoTex.wrapT = THREE.ClampToEdgeWrapping;
const lineTex = canvasTex(2048, 160, (g, w, h) => {
  g.fillStyle = '#fff'; g.font = '700 92px Arial, Helvetica, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText('HV-TRANSPORT A/S  ·  HERNING  ·  97 12 23 23', w / 2, h / 2);
});
lineTex.wrapS = lineTex.wrapT = THREE.ClampToEdgeWrapping;
cont.updateMatrixWorld(true);
addDecal(sideA, logoTex, new THREE.Vector3(-0.15, 1.62, W / 2), new THREE.Vector3(3.7, 0.91, 0.3));
addDecal(sideA, lineTex, new THREE.Vector3(-0.15, 0.92, W / 2), new THREE.Vector3(3.3, 0.26, 0.3));
function addDecalB(map, pos, size) {
  const g = new DecalGeometry(sideB, pos, new THREE.Euler(0, Math.PI, 0), size);
  const m = new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  decalMats.push(m); const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; body.add(mesh);
}
sideB.updateMatrixWorld(true);
addDecalB(logoTex, new THREE.Vector3(0.15, 1.62, -W / 2), new THREE.Vector3(3.7, 0.91, 0.3));
addDecalB(lineTex, new THREE.Vector3(0.15, 0.92, -W / 2), new THREE.Vector3(3.3, 0.26, 0.3));

// warm work light inside, switched on when the doors open
const inLight = new THREE.PointLight(0xffd7a8, 0, 7, 1.6); inLight.position.set(1.5, H - 0.4, 0); cont.add(inLight);

/* ---------- QR codes: "scan og book" sign under the livery + Sandshoppen promotion inside the doors ---------- */
const QR = { book: ["11111110011000111010001111111", "10000010100011100100001000001", "10111010100111010011001011101", "10111010100100001101101011101", "10111010011100010111101011101", "10000010001110001010101000001", "11111110101010101010101111111", "00000000100010110000100000000", "10000010101010000100011001110", "00110100111111010111000110110", "11100111001101111100010010000", "10010100010001011010110111000", "11111010110001001000101000001", "00100100001100011011101110011", "01001010011110011100011001100", "10010001110000010000011100101", "11010011101000000110000001100", "11100100001111111111101110111", "11110011011000011001000001001", "10011100001001010010101100000", "10011011100100110100111110111", "00000000110000110011100011000", "11111110011110011001101011100", "10000010010010110011100010011", "10111010010001111001111111011", "10111010010000110110110001101", "10111010001001011110011111110", "10000010000010010001011101101", "11111110110111100111000010100"], sand: ["1111111010101010001111111", "1000001011111110101000001", "1011101010011100101011101", "1011101000100100001011101", "1011101011100110101011101", "1000001000110110101000001", "1111111010101010101111111", "0000000000001100100000000", "1001111111010011110010111", "0011100110111001010111110", "0110011110011011001101001", "0110100010101001000101111", "0100011001011000101000001", "1111100100001101110010010", "1100001101100101011011111", "1001010101111010110101101", "1010001011001101111110110", "0000000011100000100010110", "1111111010011100101010001", "1000001010100101100010000", "1011101011101011111110000", "1011101011010111001000011", "1011101001011101010011111", "1000001000100001000110111", "1111111011101010110001001"] };   // segno, error level M: https://containerudlejning.dk/#book · https://www.sandshoppen.dk
function drawQR(g, rows, x, y, size, dark = '#15212a') {
  const n = rows.length, q = 4, cell = size / (n + q * 2);                     // 4-module quiet zone
  g.fillStyle = '#fff'; g.fillRect(x, y, size, size); g.fillStyle = dark;
  rows.forEach((r, i) => { for (let k = 0; k < n; k++) if (r[k] === '1') g.fillRect(Math.floor(x + (k + q) * cell), Math.floor(y + (i + q) * cell), Math.ceil(cell), Math.ceil(cell)); });
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); }
// flat sign bolted on under the logo line (a QR printed on corrugation would not scan)
const bookSignTex = canvasTex(1500, 560, (g, w, h) => {
  g.fillStyle = '#ffffff'; rrect(g, 0, 0, w, h, 36);
  g.fillStyle = '#c24a32'; rrect(g, 0, 0, 24, h, 12);
  g.fillStyle = '#15212a'; g.textBaseline = 'alphabetic';
  g.font = '800 150px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; g.fillText('SCAN OG BOOK', 70, 215);
  g.font = '600 64px "IBM Plex Sans", Arial, sans-serif'; g.fillStyle = '#3a4751'; g.fillText('Se din pris med det samme', 72, 320);
  g.font = '700 68px "IBM Plex Sans", Arial, sans-serif'; g.fillStyle = '#c24a32'; g.fillText('containerudlejning.dk', 72, 430);
  drawQR(g, QR.book, w - 520, 20, 500);
});
const signMat = new THREE.MeshStandardMaterial({ map: bookSignTex, roughness: 0.45, metalness: 0.05 });
[[1, -0.15], [-1, 0.15]].forEach(([s, x]) => {
  const sign = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), signMat));
  sign.position.set(x, 0.47, s * (W / 2 + 0.012)); if (s < 0) sign.rotation.y = Math.PI; body.add(sign);
});
// inside of the doors: visible as soon as they swing open
const sandPromoTex = canvasTex(1000, 1950, (g, w, h) => {
  g.fillStyle = '#ead9b3'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d7c092'; for (let i = 0; i < 900; i++) { g.globalAlpha = Math.random() * 0.35; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); } g.globalAlpha = 1;
  g.fillStyle = '#15212a'; g.fillRect(0, 0, w, 330);
  g.fillStyle = '#f2c46b'; g.font = '800 150px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.fillText('SANDSHOPPEN', w / 2, 205);
  g.fillStyle = '#15212a'; g.font = '800 118px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  g.fillText('SAND, GRUS', w / 2, 520); g.fillText('OG MULD', w / 2, 640);
  g.font = '600 58px "IBM Plex Sans", Arial, sans-serif'; g.fillStyle = '#3a4751'; g.fillText('– med på samme tur', w / 2, 750); g.fillText('som containeren', w / 2, 820);
  drawQR(g, QR.sand, w / 2 - 330, 900, 660);
  g.fillStyle = '#15212a'; g.font = '800 96px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; g.fillText('SCAN OG BESTIL', w / 2, 1680);
  g.fillStyle = '#c24a32'; g.font = '700 70px "IBM Plex Sans", Arial, sans-serif'; g.fillText('www.sandshoppen.dk', w / 2, 1800);
});
const drawBundlePromo = (g, w, h, logo) => {
  g.fillStyle = '#15212a'; g.fillRect(0, 0, w, h); g.textAlign = 'center';
  if (logo) { const lw = 720, lh = lw * logo.height / logo.width; g.drawImage(logo, (w - lw) / 2, 70, lw, lh); }   // HV-transport logo on top
  g.fillStyle = '#f2c46b'; g.font = '700 62px "IBM Plex Sans", Arial, sans-serif'; g.fillText('ALT FRA ÉN VOGNMAND', w / 2, 350);
  g.fillStyle = '#ffffff'; g.font = '800 160px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
  g.fillText('ÉT STED.', w / 2, 545); g.fillText('ÉN BIL.', w / 2, 710); g.fillStyle = '#e3683f'; g.fillText('ÉN FAKTURA.', w / 2, 875);
  g.fillStyle = '#c7d3d9'; g.font = '600 60px "IBM Plex Sans", Arial, sans-serif';
  ['Container', 'Affaldscontainer', 'Sand, grus og muld', 'Kranarbejde'].forEach((t, i) => g.fillText('✓  ' + t, w / 2, 1060 + i * 100));
  g.fillStyle = '#5fd08a'; rrect(g, 110, 1510, w - 220, 190, 30);
  g.fillStyle = '#0c141a'; g.font = '800 78px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; g.fillText('SAMLERABAT', w / 2, 1590);
  g.font = '600 50px "IBM Plex Sans", Arial, sans-serif'; g.fillText('pr. ekstra ydelse på samme tur', w / 2, 1660);
  g.fillStyle = '#ffffff'; g.font = '700 74px "IBM Plex Sans", Arial, sans-serif'; g.fillText('97 12 23 23', w / 2, 1830);
};
const bundlePromoTex = canvasTex(1000, 1950, (g, w, h) => drawBundlePromo(g, w, h));
{ const im = new Image(); im.onload = () => { drawBundlePromo(bundlePromoTex.image.getContext('2d'), 1000, 1950, im); bundlePromoTex.needsUpdate = true; }; im.src = 'img/logo-white.png'; }
doors.forEach(({ piv, sz }) => {
  const leaf = piv.children[0];
  const m = new THREE.MeshStandardMaterial({ map: sz > 0 ? sandPromoTex : bundlePromoTex, roughness: 0.6 });
  const promo = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.18, doorH - 0.42), m));
  promo.rotation.y = -Math.PI / 2; promo.position.set(-0.05, doorH / 2 + 0.04, 0); leaf.add(promo);
});

/* ---------- 270 scanned moving boxes ---------- */
const NB = 270, slots = [], dm = new THREE.Object3D();
for (let i = 0; i < 10; i++) for (let l = 0; l < 6; l++) for (let j = 0; j < 5; j++)
  slots.push([-2.62 + i * 0.575 + (Math.random() - .5) * .03, 0.36 + l * 0.38, -0.93 + j * 0.465 + (Math.random() - .5) * .03, (Math.random() - .5) * .08, Math.random() < .5 ? 0 : Math.PI]);
let boxes = null, shown = -1;
new GLTFLoader(manager).load('assets/box/box.gltf', g => {
  let src = null; g.scene.traverse(o => { if (o.isMesh && !src) src = o; });
  const geo = src.geometry.clone(); geo.computeBoundingBox();
  const bb = geo.boundingBox, s = new THREE.Vector3(); bb.getSize(s);
  const c = new THREE.Vector3(); bb.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
  // lay the longest side along x
  if (s.z > s.x) { geo.rotateY(Math.PI / 2); geo.computeBoundingBox(); geo.boundingBox.getSize(s); }
  geo.scale(0.54 / s.x, 0.365 / s.y, 0.43 / s.z);
  boxes = new THREE.InstancedMesh(geo, src.material, NB); boxes.castShadow = boxes.receiveShadow = true;
  const col = new THREE.Color();
  for (let n = 0; n < NB; n++) { col.setScalar(0.9 + Math.random() * 0.14); boxes.setColorAt(n, col); }
  cont.add(boxes); setBoxes(0);
  [[4.3, 0.2, -1.9, 0.25], [4.9, 0.2, -2.3, -0.35], [4.55, 0.57, -2.05, 0.1], [5.4, 0.2, -1.4, 1.2]].forEach(([x, yy, z, r]) => {
    const m = shadowed(new THREE.Mesh(geo, src.material)); m.position.set(x, yy, z); m.rotation.y = r; lawnBoxes.add(m);
  });
});
function setBoxes(f) {
  if (!boxes) return;
  const n = Math.floor(f * NB), part = f * NB - n;
  if (n === shown && part === 0) return; shown = n;
  for (let i = 0; i < NB; i++) {
    const s = slots[i]; dm.position.set(s[0], s[1], s[2]); dm.rotation.set(0, s[3] + s[4], 0);
    if (i < n) dm.scale.set(1, 1, 1);
    else if (i === n) { dm.scale.setScalar(Math.max(.001, part)); dm.position.y += (1 - part) * 0.5; }
    else dm.scale.setScalar(0.0001);
    dm.updateMatrix(); boxes.setMatrixAt(i, dm.matrix);
  }
  boxes.instanceMatrix.needsUpdate = true;
}

/* ---------- business page: photo-scanned site gear (Poly Haven, CC0) stands in the container ---------- */
const toolsG = new THREE.Group(); toolsG.visible = false; cont.add(toolsG);
if (CFG.fill === 'tools') {
  const FL = 0.18;                                            // container floor (local y); doors are at +x
  // [model, x, z, rotY, options] – x/z = footprint centre in container coordinates
  const LAYOUT = [
    ['steel_frame_shelves_01', -2.62, -0.35, Math.PI / 2, { height: 2.0 }],
    ['cement_bag', -2.3, 0.62, 0, { stack: [[0, 0, 0], [0.47, 0, 0], [0, 1, 0.03], [0.47, 1, -0.02], [0.02, 2, 0], [0.49, 2, 0.02], [0.25, 3, 0]] }],
    ['portable_generator', -1.35, 0.72, -0.2],
    ['metal_tool_chest', -1.1, -0.86, 0],
    ['propane_tank', -0.35, -0.95, 0.4],
    ['plastic_crate_03', 0.35, -0.9, 0.05, { stack: [[0, 0, 0], [0, 1, 0.02], [0.02, 2, -0.01]] }],
    ['metal_toolbox', 0.37, -0.9, 0.2, { onTop: 3 * 0.27 }],
    ['ladder_sectioned_01', 0.3, 1.05, 0, { lean: -0.09 }],
    ['plastic_jerrycan', 1.5, -0.95, 0.1, { stack: [[0, 0, 0], [0.3, 0, 0.05]] }],
    ['hand_truck', 2.15, 0.55, -Math.PI / 2 - 0.3],
    ['rusted_spade_01', 1.35, 1.08, 0, { lean: -0.16, upright: true }],
    ['sledgehammer_01', 1.62, 1.08, 0.2, { lean: -0.2, upright: true }],
  ];
  const loader = new GLTFLoader(manager);
  LAYOUT.forEach(([id, x, z, ry, o = {}]) => loader.load(`assets/site/${id}/${id}.gltf`, g => {
    const src = g.scene; src.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
    const bb = new THREE.Box3().setFromObject(src), size = new THREE.Vector3(); bb.getSize(size);
    const s = o.height ? o.height / size.y : 1;                // the shelf model comes in 10× too large
    const place = (dx, layer, dz) => {
      const it = src.clone(); it.scale.setScalar(s);
      const holder = new THREE.Group(); holder.add(it);
      it.position.set(-(bb.min.x + size.x / 2) * s, -bb.min.y * s, -(bb.min.z + size.z / 2) * s);   // bottom-centre on the floor
      holder.position.set(x + dx, FL + (o.onTop || 0) + layer * size.y * s, z + dz); holder.rotation.y = ry;
      if (o.lean) holder.rotation.x = o.lean;                  // leaning against the side wall
      toolsG.add(holder);
    };
    (o.stack || [[0, 0, 0]]).forEach(([dx, layer, dz]) => place(dx, layer, dz));
  }));
  toolsG.visible = true;
}

/* ---------- crane rigging: hook block, master link, 4 wire-rope slings ---------- */
const rig = new THREE.Group(); cont.add(rig);
const yellow = new THREE.MeshStandardMaterial({ color: 0xe0a712, roughness: 0.45, metalness: 0.2 });
const wire = new THREE.MeshStandardMaterial({ color: 0x8d9296, roughness: 0.35, metalness: 1 });
const HOOK_Y = H + 1.5;   // short four-leg sling set keeps the lift low and inside the frame
const slingG = new THREE.Group(); cont.add(slingG);
rbox(0.36, 0.52, 0.2, yellow, 0, HOOK_Y + 0.35, 0, rig, 0.04);
for (const z of [-0.105, 0.105]) { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 28), darkSteel); sh.rotation.x = Math.PI / 2; sh.position.set(0, HOOK_Y + 0.45, z); rig.add(sh); }
const shank = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), darkSteel)); shank.position.set(0, HOOK_Y, 0); rig.add(shank);
const hook = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.038, 14, 32, Math.PI * 1.45), darkSteel));
hook.position.set(0, HOOK_Y - 0.2, 0); hook.rotation.z = -Math.PI * 0.72; rig.add(hook);
const master = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 10, 24), darkSteel)); master.position.set(0.02, HOOK_Y - 0.3, 0); rig.add(master);
function ropeBetween(a, b, r, mat, parent = rig) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat));
  m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); parent.add(m); return m;
}
const link = new THREE.Vector3(0.02, HOOK_Y - 0.36, 0);
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  const corner = new THREE.Vector3(sx * (L / 2 - 0.09), H + 0.02, sz * (W / 2 - 0.08));
  ropeBetween(link, corner, 0.011, wire, slingG);
  const sk = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 8, 16), darkSteel); sk.position.copy(corner).add(new THREE.Vector3(0, 0.03, 0)); slingG.add(sk);
}
const longRopes = [-0.06, 0.06].map(z => ropeBetween(new THREE.Vector3(0, HOOK_Y + 0.6, z), new THREE.Vector3(0.9, HOOK_Y + 40, z * 0.4), 0.012, wire));

/* a few packed boxes waiting next to the container */
const lawnBoxes = new THREE.Group(); scene.add(lawnBoxes);

/* ---------- labels / overlays for the explainer steps ---------- */
function label(text, { bg = 'rgba(12,16,20,.86)', scale = 1 } = {}) {
  const t = canvasTex(768, 160, (g, w, h) => {
    g.font = '700 84px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
    const tw = g.measureText(text).width + 90, x = (w - tw) / 2, r = 44;
    g.fillStyle = bg; g.beginPath(); g.roundRect(x, 18, tw, h - 36, r); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 3);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, opacity: 0, toneMapped: false }));
  s.scale.set(2.4 * scale, 0.5 * scale, 1); s.renderOrder = 20; return s;
}
// measurements: white lines that draw themselves along length, width and height, then fade away
const dimG = new THREE.Group(); cont.add(dimG);
const dimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, toneMapped: false });
const barGeo = new THREE.CylinderGeometry(0.024, 0.024, 1, 8); barGeo.translate(0, 0.5, 0);
function dimText(text) {
  const t = canvasTex(1024, 200, (g, w, h) => {
    g.font = '700 110px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = 18; g.fillStyle = '#fff'; g.fillText(text, w / 2, h / 2);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, opacity: 0, toneMapped: false }));
  sp.scale.set(1.9, 0.37, 1); sp.userData.base = sp.scale.clone(); sp.renderOrder = 21; return sp;
}
function makeDim(a, b, tick, text, lab, grp = dimG) {
  a = new THREE.Vector3(...a); b = new THREE.Vector3(...b); tick = new THREE.Vector3(...tick);
  const dir = b.clone().sub(a), len = dir.length(); dir.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const bar = new THREE.Mesh(barGeo, dimMat); bar.position.copy(a); bar.quaternion.copy(q); bar.renderOrder = 20;
  const tq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tick.clone().normalize());
  const t0 = new THREE.Mesh(barGeo, dimMat), t1 = new THREE.Mesh(barGeo, dimMat);
  [t0, t1].forEach(m => { m.quaternion.copy(tq); m.scale.y = tick.length(); m.renderOrder = 20; });
  t0.position.copy(a).addScaledVector(tick, -0.5); t1.position.copy(b).addScaledVector(tick, -0.5);
  const sp = dimText(text); sp.position.copy(a).lerp(b, 0.5).add(new THREE.Vector3(...lab));
  grp.add(bar, t0, t1, sp);
  return p => {
    bar.visible = p > 0.001; bar.scale.y = Math.max(0.001, len * p);
    t0.visible = p > 0.001; t1.visible = p > 0.985;
    sp.material.opacity = ss(p, 0.55, 1) * dimMat.opacity;
  };
}
const off = 0.4;
const dimHero = new THREE.Group(), dimVilla = new THREE.Group(); dimG.add(dimHero, dimVilla);
const dimSet = (DS, grp) => [
  makeDim([-L / 2, 0.02, DS * (W / 2 + off)], [L / 2, 0.02, DS * (W / 2 + off)], [0, 0, DS * 0.3], 'Længde 587 cm', [0, 0.32, DS * 0.25], grp),
  makeDim([L / 2 + off, H + 0.02, DS * W / 2], [L / 2 + off, H + 0.02, -DS * W / 2], [0.3, 0, 0], 'Bredde 235 cm', [0.35, 0.38, 0], grp),
  makeDim([L / 2 + off, 0, DS * (W / 2 + off)], [L / 2 + off, H, DS * (W / 2 + off)], [0.22, 0, DS * 0.22], 'Højde 237 cm', [0.95, 0, DS * 0.45], grp),
];
const dimsHero = dimSet(1, dimHero), dimsVilla = dimSet(-1, dimVilla); // each on the side its camera sees
let dims = dimsVilla;

/* ---------- HV crane truck: photoreal side-view truck on the street + real 3D loader crane ---------- */
// truck image (AI side view, HV lettering added) placed as a flat layer along the street at true scale;
// 81.5 px per metre in the 960 px reference frame: 11.78 m × 6.58 m, ground line 1.89 m below centre
const ROAD_Z = +(new URLSearchParams(location.search).get("rz") ?? CFG.roadZ ?? 9.08), PX = 81.5; // house-side lane of the street, parallel to the kerb
const truckG = new THREE.Group(); scene.add(truckG);
// the truck photo is graded offline to the plate (evening key from behind-right, lifted blacks, no studio halo, tinted glass)
const truckTex = tex('assets/truck_side_graded.webp', true); truckTex.wrapS = truckTex.wrapT = THREE.ClampToEdgeWrapping; truckTex.anisotropy = 8;
const truckGeo = new THREE.PlaneGeometry(960 / PX, 536 / PX);
const truckPlane = new THREE.Mesh(truckGeo, new THREE.MeshBasicMaterial({ map: truckTex, transparent: true, alphaTest: 0.03, toneMapped: false }));
truckPlane.rotation.y = Math.PI; truckPlane.position.set(0, (422 - 268) / PX, -1.25); truckPlane.renderOrder = 1; truckG.add(truckPlane);
// invisible silhouette slices through the body: together they cast a truck-shaped shadow onto the asphalt in the sun direction
// (the shadow pass copies map + alphaTest from the object's own material, so the cut-out lives on the invisible material itself)
const casterMat = new THREE.MeshBasicMaterial({ map: truckTex, alphaTest: 0.5, colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
[-1.2, -0.6, 0, 0.6, 1.2].forEach(z => {
  const m = new THREE.Mesh(truckGeo, casterMat);
  m.rotation.y = Math.PI; m.position.set(0, (422 - 268) / PX, z); m.castShadow = true; truckG.add(m);
});
const localX = xp => -(xp - 480) / PX;           // reference-frame x → metres along the truck (+x = towards the cab)
// contact shadow on the asphalt
const tShadow = (() => {
  // soft-edged ambient occlusion under the body (feathered on all four sides, no square ends)
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d');
  g.filter = 'blur(14px)'; g.fillStyle = 'rgba(0,0,0,.9)'; g.beginPath(); g.roundRect(36, 44, 440, 72, 36); g.fill();
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 3.5), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(localX(480) , 0.02, 0.1); truckG.add(m); return m;
})();
const tyreContact = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.95)'); gr.addColorStop(.45, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
  const grp = new THREE.Group(); truckG.add(grp);
  [190, 555, 667].forEach(xp => [-1.3, 1.3].forEach(z => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.62), mat); m.rotation.x = -Math.PI / 2; m.position.set(localX(xp), 0.025, z); grp.add(m);
  }));
  return grp;
})();

// real 3D wheels over the photo's wheels (sharper, and they turn when the truck drives)
const tyreM = new THREE.MeshStandardMaterial({ color: 0x26272a, roughness: 0.82 });
const rimM = new THREE.MeshStandardMaterial({ color: 0xc4c7c9, roughness: 0.32, metalness: 0.9 });
const hubM = new THREE.MeshStandardMaterial({ color: 0x2b2e31, roughness: 0.5, metalness: 0.6 });
const WR = 0.5, WT = 0.3;
const tyreGeo = (() => { const pts = []; for (let i = 0; i <= 20; i++) { const a = -Math.PI / 2 + Math.PI * i / 20; pts.push(new THREE.Vector2(WR - 0.075 + Math.cos(a) * 0.075, Math.sin(a) * WT / 2)); } pts.unshift(new THREE.Vector2(0.31, -WT / 2)); pts.push(new THREE.Vector2(0.31, WT / 2)); const g = new THREE.LatheGeometry(pts, 64); g.rotateX(Math.PI / 2); return g; })();
const treadGeo = new THREE.TorusGeometry(WR - 0.005, 0.012, 6, 90);
const rimGeo = (() => { const pts = [new THREE.Vector2(0.001, 0.02), new THREE.Vector2(0.12, 0.03), new THREE.Vector2(0.2, 0.0), new THREE.Vector2(0.29, -0.04), new THREE.Vector2(0.32, -0.12)]; const g = new THREE.LatheGeometry(pts, 48); g.rotateX(-Math.PI / 2); return g; })();
const truckWheels = [];
[190, 555, 667].forEach(xp => {
  const w = new THREE.Group(); w.position.set(localX(xp), WR - 0.02, -1.33); truckG.add(w);
  const ty = shadowed(new THREE.Mesh(tyreGeo, tyreM)); w.add(ty);
  const rim = shadowed(new THREE.Mesh(rimGeo, rimM)); rim.position.z = -WT / 2 + 0.01; w.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 24), hubM); hub.rotation.x = Math.PI / 2; hub.position.z = -WT / 2 - 0.03; w.add(hub);
  for (let i = 0; i < 10; i++) { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 6), rimM); n.rotation.x = Math.PI / 2; const a = i / 10 * Math.PI * 2; n.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, -WT / 2 - 0.02); w.add(n); }
  for (let i = 0; i < 8; i++) { const h = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), hubM); const a = (i + 0.5) / 8 * Math.PI * 2; h.position.set(Math.cos(a) * 0.245, Math.sin(a) * 0.245, -WT / 2 - 0.035); h.rotation.y = Math.PI; w.add(h); }
  truckWheels.push(w);
});

// loader crane (HIAB-style knuckle boom) mounted in the gap behind the cab
const hvRed = (() => { const m = framePaint.clone(); m.color = RED_F.clone().multiplyScalar(0.92); m.roughness = 0.78; m.metalness = 0.3; return m; })();   // same worn paint as the container frame, so crane and container read as one real object
const chrome = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.06, metalness: 1 });
const alu = new THREE.MeshStandardMaterial({ color: 0xd4d7d9, roughness: 0.22, metalness: 1 });
const stripeMat = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#f2b61c'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#171717';
  for (let i = -64; i < 128; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 11, 0); g.lineTo(i + 11 - 64, 64); g.lineTo(i - 64, 64); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }); })();
const CR_X = localX(283);
const craneBase = new THREE.Group(); craneBase.position.set(CR_X, 0, 0); truckG.add(craneBase);
// HIAB-style base: subframe on the chassis, stabiliser beam with outriggers, slewing housing, column, valve bank + hoses
const cast = (geo, mat, x, y, z, parent = craneBase) => { const m = shadowed(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); parent.add(m); return m; };
rbox(0.72, 0.2, 1.0, darkSteel, 0, 1.12, 0, craneBase, 0.02);                       // subframe on the chassis rails
rbox(0.46, 0.34, 2.46, hvRed, 0, 1.02, 0, craneBase, 0.03);                         // stabiliser beam across the truck
[-1.18, 1.18].forEach(z => {
  cast(new THREE.CylinderGeometry(0.075, 0.075, 0.95, 16), darkSteel, 0, 0.62, z);  // outrigger leg (stowed)
  cast(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 20), darkSteel, 0, 0.16, z);   // foot plate
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), stripeMat); warn.position.set(0, 1.02, z + Math.sign(z) * 0.006); warn.rotation.y = z > 0 ? 0 : Math.PI; craneBase.add(warn);
});
cast(new THREE.CylinderGeometry(0.44, 0.46, 0.34, 32), hvRed, 0, 1.39, 0);        // slewing gear housing
cast(new THREE.CylinderGeometry(0.47, 0.47, 0.04, 32), darkSteel, 0, 1.57, 0);    // slew ring
const column = cast(new THREE.CylinderGeometry(0.25, 0.29, 1.42, 28), hvRed, 0, 2.3, 0);
// control valve bank with levers on the kerb side, hoses running up the column
const valve = new THREE.Group(); valve.position.set(0, 1.42, -1.05); craneBase.add(valve);
rbox(0.5, 0.2, 0.14, darkSteel, 0, 0, 0, valve, 0.015);
for (let i = 0; i < 6; i++) { const lv = cast(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), chrome, -0.2 + i * 0.08, 0.2, -0.02, valve); lv.rotation.x = -0.35;
  cast(new THREE.SphereGeometry(0.028, 10, 8), rubber, -0.2 + i * 0.08, 0.35, -0.08, valve); }
const hoseM = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.55 });
[[-0.12, 0], [0.0, 0.05], [0.12, 0.1]].forEach(([dx, s]) => {
  const c = new THREE.CatmullRomCurve3([new THREE.Vector3(dx, 1.5, -1.0), new THREE.Vector3(dx * 1.5, 1.7, -0.6), new THREE.Vector3(dx + 0.18, 2.2 + s, -0.3), new THREE.Vector3(dx + 0.2, 2.9, -0.2)]);
  craneBase.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.018, 8), hoseM)));
});
function hexBoom(len, w, mat) {
  const s = new THREE.Shape(), r = w / 2, h = w * 0.42;
  s.moveTo(-r * 0.5, -h); s.lineTo(r * 0.5, -h); s.lineTo(r, 0); s.lineTo(r * 0.5, h); s.lineTo(-r * 0.5, h); s.lineTo(-r, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
  g.rotateY(Math.PI / 2); return shadowed(new THREE.Mesh(g, mat));
}
const slew = new THREE.Group(); slew.position.set(0, 3.0, 0); craneBase.add(slew);
rbox(0.5, 0.4, 0.5, hvRed, 0, 0, 0, slew, 0.06);
const L1 = 4.2, L2 = 4.0, EXT_MAX = 8.5;
const innerB = new THREE.Group(); slew.add(innerB); innerB.add(hexBoom(L1, 0.4, hvRed));
const outerB = new THREE.Group(); outerB.position.set(L1, 0, 0); innerB.add(outerB);
rbox(0.5, 0.44, 0.5, hvRed, 0, 0, 0, outerB, 0.06);
outerB.add(hexBoom(L2, 0.34, hvRed));
const exts = [hexBoom(L2 * 0.95, 0.28, alu), hexBoom(L2 * 0.95, 0.23, alu), hexBoom(L2 * 0.95, 0.18, alu)]; outerB.add(...exts);
const tipBlock = rbox(0.24, 0.3, 0.22, hvRed, 0, 0, 0, outerB, 0.04);
const tip = new THREE.Object3D(); outerB.add(tip);
function ram(r1, r2) { const g = new THREE.Group(); slew.add(g); const b = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r1, r1, 1, 20), hvRed)), rd = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r2, r2, 1, 16), chrome)); g.add(b, rd); return { barrel: b, rod: rd }; }
const liftRam = ram(0.1, 0.055), knuckleRam = ram(0.08, 0.045);
function placeRam(rm, a, b) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length(), dir = d.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), bl = Math.min(len * 0.62, 1.9);
  rm.barrel.scale.y = bl; rm.barrel.position.copy(a).addScaledVector(dir, bl / 2); rm.barrel.quaternion.copy(q);
  const rl = len - bl * 0.85; rm.rod.scale.y = rl; rm.rod.position.copy(b).addScaledVector(dir, -rl / 2); rm.rod.quaternion.copy(q);
}
const v2 = (x, y) => new THREE.Vector3(x, y, 0);
function poseCrane(p) {
  slew.rotation.y = p.yaw; innerB.rotation.z = p.a1; outerB.rotation.z = p.a2;
  exts.forEach((e, i) => e.position.x = 0.15 + p.ext * (i + 1) / 3);
  const tipX = 0.15 + p.ext + L2 * 0.95 + 0.1; tip.position.set(tipX, -0.05, 0); tipBlock.position.set(tipX - 0.05, 0, 0);
  const c1 = Math.cos(p.a1), s1 = Math.sin(p.a1), onInner = (x, y) => v2(x * c1 - y * s1, x * s1 + y * c1);
  placeRam(liftRam, v2(0.34, -1.1), onInner(1.6, -0.28));
  const E = onInner(L1, 0), c2 = Math.cos(p.a1 + p.a2), s2 = Math.sin(p.a1 + p.a2);
  placeRam(knuckleRam, onInner(2.3, 0.3), v2(E.x + -0.4 * c2 - 0.34 * s2, E.y + -0.4 * s2 + 0.34 * c2));
}
function solveCrane(target) {
  truckG.updateMatrixWorld(true);
  const L = craneBase.worldToLocal(target.clone()), B = slew.position;   // solve in the truck's own frame (the truck is turned 180°)
  const dx = L.x - B.x, dz = L.z - B.z, dy = L.y - B.y;
  const yaw = Math.atan2(-dz, dx), r = Math.hypot(dx, dz), dist = Math.hypot(r, dy);
  const reach = clamp(dist - L1 * 0.88, L2, L2 + EXT_MAX), ext = reach - L2, L2e = L2 * 0.95 + 0.3 + ext;
  const cosA = clamp((L1 * L1 + dist * dist - L2e * L2e) / (2 * L1 * dist), -1, 1);
  const a1 = Math.atan2(dy, r) + Math.acos(cosA), ex = L1 * Math.cos(a1), ey = L1 * Math.sin(a1);
  return { yaw, a1, a2: Math.atan2(dy - ey, r - ex) - a1, ext };
}
const STOW = { yaw: -Math.PI / 2, a1: 0.22, a2: -2.95, ext: 0 };   // transport position: folded flat across the truck behind the cab, ~4 m total height
const angLerp = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const lerpPose = (p, q, t) => ({ yaw: angLerp(p.yaw, q.yaw, t), a1: lerp(p.a1, q.a1, t), a2: lerp(p.a2, q.a2, t), ext: lerp(p.ext, q.ext, t) });
const mainRope = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 8), wire)); scene.add(mainRope);
const BED_X = localX(591), BED_Y = (422 - 320) / PX + 0.02;   // container centre on the flatbed (truck-local)
// the flatbed's deck surface (the photo's pale deck was lost with the studio halo): a worn wooden platform the container stands on
const deckM = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.92 });
const deck = shadowed(new THREE.Mesh(new THREE.BoxGeometry(localX(275) - localX(866), 0.09, 2.4), deckM));
deck.position.set((localX(275) + localX(866)) / 2, BED_Y - 0.045, 0); truckG.add(deck);
[-1, 1].forEach(s => { const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(localX(275) - localX(866), 0.06, 0.05), hvRed)); rail.position.set(deck.position.x, BED_Y - 0.03, s * 1.18); truckG.add(rail); });
// hero: one clean white line with the truck's total height next to the cab
const truckDimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, toneMapped: false });
const truckDim = (() => {
  const g = new THREE.Group(); truckG.add(g);
  // on the container side, centred between its rear edge and the logo: street to container top
  const rear = BED_X - L / 2, logoEnd = BED_X - 1.7, x = (rear + logoEnd) / 2, z = -W / 2 - 0.04, top = BED_Y + H;
  const bar = new THREE.Mesh(barGeo, truckDimMat); bar.position.set(x, 0, z); bar.renderOrder = 20; g.add(bar);
  const tq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  const t0 = new THREE.Mesh(barGeo, truckDimMat), t1 = new THREE.Mesh(barGeo, truckDimMat);
  [t0, t1].forEach((m, i) => { m.quaternion.copy(tq); m.scale.y = 0.5; m.position.set(x, i ? top : 0.01, z); m.renderOrder = 20; g.add(m); });
  // label runs up the red container side between the line and the rear edge, so it always reads against the red
  const sp = dimText('Højde ca. 4 m'); sp.material.rotation = Math.PI / 2; sp.scale.multiplyScalar(1.22);
  sp.position.set((x + rear) / 2 - 0.02, BED_Y + H / 2, z - 0.02); g.add(sp);
  return p => { bar.scale.y = Math.max(0.001, top * p); t1.visible = p > 0.98; sp.material.opacity = ss(p, 0.6, 1) * truckDimMat.opacity; };
})();
const TX_PARK = +(new URLSearchParams(location.search).get("tx") ?? CFG.txPark ?? 1.2); // parked at the kerb across the driveway mouth; seen from across the field it stands roof-high next to the house

/* ---------- camera ---------- */
// steps 2-5 are free 3D close-ups; steps 0-1 use the photo's own camera
const KF = {
  A: { p: [-70, 30, -22], t: [6, 0, -2] },         // drone view along the street
  B: { p: [5.2, 2.3, -11.6], t: [-0.8, 2.7, 1] },    // eye level from the road while the crane sets it down
  2: { p: [-1.6, 1.85, -11.2], t: [0, 1.3, 0] },
  3: { p: [9.8, 1.75, -3.2], t: [0.9, 1.2, 0] },
  4: { p: [4.4, 2.3, -8.9], t: [-0.4, 1.3, 0.6] },
  5: { p: [-9.5, 6.8, -17.5], t: [0.4, 1.2, -3] },
};
let W0 = 0, H0 = 0, mobile = false;
function resize() { W0 = innerWidth; H0 = innerHeight; mobile = W0 < 900; renderer.setSize(W0, H0, false); }
addEventListener('resize', resize); resize();
let mx = 0, my = 0;
addEventListener('mousemove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, { passive: true });

// photo framing: CSS "cover" with a slow push-in anchored on the container; the 3D camera uses the identical crop
function photoFrame(zoom, P = PHOTO, anchorOverride) {
  const A = anchorOverride || P.anchor;
  const s = Math.max(W0 / P.w, H0 / P.h) * zoom, pw = P.w * s, ph = P.h * s;
  const baseS = Math.max(W0 / P.w, H0 / P.h);
  const ax = mobile ? MOBILE_AX : 0.5, ay = mobile ? 0.5 : 0.42;   // phones: keep the truck and the driveway in the crop
  // where the anchor sits at zoom 1, keep it there while zooming
  const ox1 = (W0 - PHOTO.w * baseS) * ax, oy1 = (H0 - PHOTO.h * baseS) * ay;
  const ox1b = (W0 - P.w * baseS) * ax, oy1b = (H0 - P.h * baseS) * ay;
  const sx = ox1b + A[0] * baseS, sy = oy1b + A[1] * baseS;
  return { pw, ph, ox: sx - A[0] * s, oy: sy - A[1] * s };
}
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), qA = new THREE.Quaternion(), mtmp = new THREE.Matrix4();
function kfPose(i, out) {
  const kf = KF[i]; out.pos.fromArray(kf.p); vB.fromArray(kf.t);
  mtmp.lookAt(out.pos, vB, new THREE.Vector3(0, 1, 0)); out.quat.setFromRotationMatrix(mtmp);
}
const poseA = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, poseB = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

const DEBUG_K = new URLSearchParams(location.search).has('k') ? +new URLSearchParams(location.search).get('k') : null;
if (DEBUG_K !== null) { history.scrollRestoration = 'manual'; scrollTo(0, 0); document.getElementById('story').style.visibility = 'hidden'; }

const clock = new THREE.Clock();
let kS = 0, revealed = false, revealT = 0, lastFieldTop = -1, lastShade = '';
const easeIO = x => x * x * (3 - 2 * x);
function frame() {
  requestAnimationFrame(frame);
  const st = window.__story || { k: 0, active: true };
  if (DEBUG_K !== null) { st.k = window.__dbgK ?? DEBUG_K; st.active = true; }
  if (!st.active && revealed) return;
  const dt = Math.min(clock.getDelta(), 0.5), t = clock.elapsedTime;
  kS += (st.k - kS) * (reduce ? 1 : 1 - Math.exp(-dt * 4.5));
  const k = kS;

  /* one continuous scene in front of the villa:
     0 truck parked, container on the flatbed · 0.2-1.0 crane unloads onto the driveway · 1.25-1.6 truck leaves
     2 measurements · 2.45-3.8 doors open, boxes, doors close · 3.85-4.15 truck returns · 4.2-4.7 crane loads it back
     4.8-5.0 truck drives off to the new home */
  if (plateEl && plateEl.dataset.src !== 'villa') { plateEl.dataset.src = 'villa'; plateEl.style.backgroundImage = `url(${PLATE_URL})`; plateEl.style.visibility = 'visible'; }
  if (dipEl) dipEl.style.opacity = '0';
  catcher.visible = true;
  document.body.classList.toggle('photo-mode', k < 0.85);
  document.body.classList.toggle('studio-mode', false);
  document.body.classList.toggle('villa-mode', k >= 0.85 && k < 4.75);
  document.body.classList.toggle('final-mode', k >= 4.75);
  // smooth scene shading: hero shade eases out while the container is unloaded, card shade eases in; both return/leave for the finale
  const shHero = Math.min(1, (1 - ss(k, 0.3, 1.2)) + ss(k, 4.55, 5.0)), shCards = ss(k, 0.5, 1.3) * (1 - ss(k, 4.55, 5.0));
  const shKey = Math.round(shHero * 100) + '|' + Math.round(shCards * 100);
  if (shKey !== lastShade) { lastShade = shKey; const st = document.documentElement.style; st.setProperty('--sh-hero', shHero.toFixed(2)); st.setProperty('--sh-cards', shCards.toFixed(2)); }

  const pf = photoFrame(PLATE_ZOOM, VILLA, PLATE_ANCHOR);
  camera.position.copy(VILLA.pos); camera.quaternion.copy(VILLA.quat); camera.fov = VILLA.fovY;
  camera.aspect = pf.pw / pf.ph;
  camera.setViewOffset(pf.pw, pf.ph, -pf.ox, -pf.oy, W0, H0);
  camera.near = 0.3; camera.far = 600;
  camera.updateProjectionMatrix();
  if (plateEl) { plateEl.style.backgroundSize = `${pf.pw}px ${pf.ph}px`; plateEl.style.backgroundPosition = `${pf.ox}px ${pf.oy}px`; }
  const fieldTop = Math.round(pf.oy + FIELD_ROW / VILLA.h * pf.ph);   // screen y of the near kerb: the hero copy starts on the field just below it
  if (fieldTop !== lastFieldTop) { lastFieldTop = fieldTop; document.documentElement.style.setProperty('--field-top', fieldTop + 'px'); window.__fitHero && requestAnimationFrame(window.__fitHero); }

  if (sun.shadow.camera.right !== 22) { Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, far: 160 }); sun.shadow.camera.updateProjectionMatrix(); }
  sun.target.position.set(0, 0, 5); sun.position.set(...SUN_OFS);   // plate shadows (trees on the lawn) run left and a little toward the camera: evening sun from the right, slightly behind

  // truck: parked → leaves to the left → comes back → leaves with the container
  const leave1 = ss(k, 1.25, 1.6), back = ss(k, 3.85, 4.15), leave2 = ss(k, 4.8, 5.0);
  let TX = TX_PARK;                               // cab points -x (to the left in the picture)
  if (k < 3.85) TX -= 45 * leave1 * leave1;
  else if (k < 4.8) TX = TX_PARK + 45 * Math.pow(1 - back, 2);
  else TX -= 45 * leave2 * leave2;
  truckG.position.set(TX, 0, ROAD_Z); truckG.rotation.y = Math.PI; truckG.visible = Math.abs(TX - TX_PARK) < 44;
  truckWheels.forEach(w => w.rotation.z = -(TX - TX_PARK) / WR);
  truckG.updateMatrixWorld(true);

  // container: on the flatbed (u=0) … on the driveway (u=1), carried along an arc by the crane
  const unload = easeIO(ss(k, 0.46, 0.95)), load = easeIO(ss(k, 4.3, 4.72));
  const u = k < 3 ? unload : 1 - load;
  const bedPos = truckG.localToWorld(new THREE.Vector3(BED_X, BED_Y, 0));
  const dPos = new THREE.Vector3(0, 0, 0);
  const cp = bedPos.clone().lerp(dPos, u); cp.y += Math.sin(Math.PI * u) * 0.9;   // just clears the flatbed and the hedge
  cont.position.copy(cp); cont.visible = true;
  const swing = Math.sin(Math.PI * u);
  cont.rotation.set(0, angLerp(Math.PI, -Math.PI / 2 + CONT_END_YAW, easeIO(u)) + swing * Math.sin(t * .7) * 0.03, 0); // along the truck → doors to the street
  const grounded = u > 0.98 ? 1 : 0;
  blob.visible = grounded > 0; blob.material.opacity = 0.6; blob.scale.setScalar(1); blob.position.y = 0.03; blob.rotation.set(-Math.PI / 2, 0, cont.rotation.y);

  // crane: fold out → follow the hook → fold away
  cont.updateMatrixWorld(true);
  const hookTop = cont.localToWorld(new THREE.Vector3(0, HOOK_Y + 0.62, 0));
  const T = hookTop.clone(); T.y += 0.5;
  const work = k < 3 ? ss(k, 0.3, 0.44) * (1 - ss(k, 1.0, 1.22)) : ss(k, 4.12, 4.3) * (1 - ss(k, 4.72, 4.86));
  poseCrane(lerpPose(STOW, solveCrane(T), work));
  // rigging: hook + slings attached only while the crane holds the container
  const attached = k < 3 ? (k > 0.42 && k < 0.98) : (k > 4.25 && k < 4.74);
  rig.visible = work > 0.6; slingG.visible = attached; longRopes.forEach(r => r.visible = false); rig.position.set(0, 0, 0);
  truckG.updateMatrixWorld(true);
  const tipW = new THREE.Vector3(); tip.getWorldPosition(tipW);
  if (!attached && rig.visible) { const hw = tipW.clone(); hw.y -= 1.0; rig.position.copy(cont.worldToLocal(hw)).sub(new THREE.Vector3(0, HOOK_Y + 0.62, 0)); }
  const rigTopW = cont.localToWorld(new THREE.Vector3(0, HOOK_Y + 0.62, 0).add(rig.position));
  const rd = new THREE.Vector3().subVectors(tipW, rigTopW), rl = rd.length();
  mainRope.visible = rig.visible && rl > 0.05; mainRope.scale.y = Math.max(rl, 0.001);
  mainRope.position.copy(rigTopW).addScaledVector(rd, 0.5); mainRope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rd.normalize());

  // measurements: draw on the container on the truck in the hero, and again on the driveway
  const onTruck = u < 0.5;
  dims = dimsVilla; dimHero.visible = false; dimVilla.visible = true;
  const tt = revealed ? t - revealT : 0;
  // hero: only the truck's height; the container's measurements come once it stands on the driveway
  // truck height: hidden on arrival, draws in with the first scroll, gone before the crane starts working
  // truck height: hidden on arrival, draws in with the first scroll while the hero is still pinned (k < ~0.3), gone once the crane unfolds
  truckDimMat.opacity = ss(k, 0.01, 0.06) * (1 - ss(k, 0.27, 0.33));
  truckDim(ss(k, 0.02, 0.14));
  dimMat.opacity = ss(k, 1.88, 1.95) * (1 - ss(k, 2.3, 2.45));
  dims[0](ss(k, 1.9, 2.04)); dims[1](ss(k, 2.0, 2.12)); dims[2](ss(k, 2.08, 2.2));
  dimG.visible = dimMat.opacity > 0.01;
  [dimHero, dimVilla].forEach(g => g.children.forEach(c => { if (c.isSprite) c.scale.copy(c.userData.base).multiplyScalar(onTruck ? 1.4 : 2.6); }));

  // doors open, boxes stack up, doors close again
  const open = ss(k, 2.45, 2.85) * (1 - ss(k, 3.45, 3.8));
  doors.forEach(({ piv, sz }) => piv.rotation.y = sz * -open * Math.PI);   // both doors swing flat back against the sides (180°)
  setBoxes(CFG.boxes === false ? 0 : ss(k, 2.6, 3.25));   // private page: moving boxes
  inLight.intensity = open * 3.2;
  lawnBoxes.visible = CFG.boxes !== false && k > 2.0 && k < 3.0;
  lawnBoxes.children.forEach((b, i) => b.visible = k < 2.65 + i * 0.08);

  renderer.render(scene, camera);
  if (ready && !revealed) { revealed = true; revealT = t; document.body.classList.add('scene-ready'); loaderEl && setTimeout(() => loaderEl.remove(), 900); }
}
frame();
