/** Demo template: a 3D racing game with three.js (used when no Anthropic API key is configured). */
export const RACER = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>__TITLE__</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#0b0b1a;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff}
canvas{display:block}
#hud{position:fixed;top:12px;left:12px;right:12px;display:flex;justify-content:space-between;pointer-events:none;font-weight:700;text-shadow:0 2px 6px rgba(0,0,0,.5);font-size:18px}
#hud div{background:rgba(0,0,0,.3);padding:8px 14px;border-radius:12px}
#overlay{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(8,8,26,.6);text-align:center;padding:24px}
#overlay h1{margin:0;font-size:clamp(34px,8vw,64px)}
#overlay p{margin:0;max-width:520px;opacity:.9;line-height:1.5}
#overlay button{margin-top:10px;font:700 22px system-ui;padding:14px 46px;border:0;border-radius:999px;cursor:pointer}
.pad{position:fixed;bottom:22px;display:none;gap:14px}
.pad button{width:74px;height:74px;border-radius:50%;border:0;background:rgba(255,255,255,.22);color:#fff;font-size:28px;touch-action:none}
.pad button.on{background:rgba(255,255,255,.45)}
#pause{position:fixed;top:12px;left:50%;transform:translateX(-50%);width:44px;height:44px;border-radius:50%;border:0;background:rgba(0,0,0,.35);color:#fff;font-size:18px;display:none}
</style>
</head>
<body>
<div id="hud"><div id="lap"></div><div id="pos"></div><div id="spd"></div></div>
<button id="pause" aria-label="Pause">❚❚</button>
<div class="pad" id="padL" style="left:18px"><button data-k="left">◀</button><button data-k="right">▶</button></div>
<div class="pad" id="padR" style="right:18px"><button data-k="brake">▼</button><button data-k="gas">▲</button></div>
<div id="overlay"><h1 id="ovTitle"></h1><p id="ovText"></p><button id="ovBtn"></button></div>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
const CFG = __CONFIG__;
const HE = PREFLY.locale === 'he';
const T = HE
  ? { play: 'סעו!', goal: '3 הקפות נגד 3 יריבים. עלו על משטחי הטורבו!', keys: 'חיצים / WASD לנהיגה', touch: 'כפתורי נהיגה על המסך', lap: 'הקפה', pos: 'מקום', fin: 'סיימתם במקום', again: 'מרוץ נוסף', paused: 'הפסקה', best: 'זמן שיא' }
  : { play: 'Race!', goal: '3 laps against 3 rivals. Hit the boost pads!', keys: 'Arrows / WASD to drive', touch: 'On-screen driving buttons', lap: 'Lap', pos: 'Pos', fin: 'You finished', again: 'Race again', paused: 'Paused', best: 'Best time' };
const C = CFG.colors;
document.documentElement.dir = HE ? 'rtl' : 'ltr';
const $ = (id) => document.getElementById(id);
const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(C[0]);
scene.fog = new THREE.Fog(C[0], 80, 420);
const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 1000);
function resize() { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); resize();

scene.add(new THREE.HemisphereLight(0xdde6ff, 0x2a2440, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(80, 140, 60); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60 });
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshLambertMaterial({ color: C[3] || 0x2f6b3a }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const ctrl = [];
for (let i = 0; i < 14; i++) {
  const a = (i / 14) * Math.PI * 2;
  const r = 170 + Math.sin(a * 3) * 55 + Math.cos(a * 2) * 30;
  ctrl.push(new THREE.Vector3(Math.cos(a) * r * 1.25, 0, Math.sin(a) * r));
}
const curve = new THREE.CatmullRomCurve3(ctrl, true, 'catmullrom', 0.5);
const N = 600, ROAD = 16;
const pts = curve.getSpacedPoints(N).slice(0, N);
const tangents = pts.map((_, i) => pts[(i + 1) % N].clone().sub(pts[(i + N - 1) % N]).normalize());
const normals = tangents.map((t) => new THREE.Vector3(-t.z, 0, t.x));

function ribbon(width, y, color, offset = 0) {
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const k = i % N, n = normals[k], p = pts[k];
    const a = p.clone().addScaledVector(n, offset - width / 2), b = p.clone().addScaledVector(n, offset + width / 2);
    pos.push(a.x, y, a.z, b.x, y, b.z);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  m.receiveShadow = true; scene.add(m); return m;
}
ribbon(ROAD + 3, 0.02, 0xf5f5f5);
ribbon(ROAD, 0.04, 0x2b2b38);

const stripeGeo = new THREE.BoxGeometry(0.6, 0.06, 3);
const stripe = new THREE.InstancedMesh(stripeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), N / 6);
const dummy = new THREE.Object3D();
for (let i = 0, j = 0; i < N; i += 6, j++) { dummy.position.copy(pts[i]).setY(0.08); dummy.lookAt(pts[(i + 1) % N].clone().setY(0.08)); dummy.updateMatrix(); stripe.setMatrixAt(j, dummy.matrix); }
scene.add(stripe);

const pads = [];
const padMat = new THREE.MeshBasicMaterial({ color: C[2] });
for (let i = 40; i < N; i += 110) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 5), padMat);
  m.position.copy(pts[i]).setY(0.1); m.lookAt(pts[(i + 1) % N].clone().setY(0.1)); scene.add(m); pads.push(i);
}
const startLine = new THREE.Mesh(new THREE.BoxGeometry(ROAD, 0.08, 1.4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
startLine.position.copy(pts[0]).setY(0.09); startLine.lookAt(pts[1].clone().setY(0.09)); scene.add(startLine);

const treeCount = 220;
const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 6), new THREE.MeshLambertMaterial({ color: 0x6b4423 }), treeCount);
const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2, 8, 7), new THREE.MeshLambertMaterial({ color: 0x1f7a4a }), treeCount);
leaves.castShadow = true;
for (let i = 0; i < treeCount; i++) {
  const k = Math.floor(Math.random() * N), side = Math.random() < 0.5 ? -1 : 1, d = ROAD / 2 + 8 + Math.random() * 40;
  const p = pts[k].clone().addScaledVector(normals[k], side * d), s = 0.7 + Math.random() * 0.8;
  dummy.position.set(p.x, 2 * s, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s, s, s); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
  dummy.position.set(p.x, 7 * s, p.z); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix);
}
scene.add(trunks, leaves);

function makeCar(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4.2), new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4 }));
  body.position.y = 0.75; body.castShadow = true; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 2), new THREE.MeshStandardMaterial({ color: 0x1b1d2e, metalness: 0.5, roughness: 0.2 }));
  cab.position.set(0, 1.35, -0.2); cab.castShadow = true; g.add(cab);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 0.6), new THREE.MeshStandardMaterial({ color }));
  wing.position.set(0, 1.4, 1.9); g.add(wing);
  const wGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 14); wGeo.rotateZ(Math.PI / 2);
  const wMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const [x, z] of [[-1.1, -1.4], [1.1, -1.4], [-1.1, 1.4], [1.1, 1.4]]) { const w = new THREE.Mesh(wGeo, wMat); w.position.set(x, 0.45, z); g.add(w); }
  scene.add(g); return g;
}
const player = { mesh: makeCar(C[1]), x: 0, z: 0, heading: 0, speed: 0, idx: 0, laps: 0, prog: 0, boost: 0, done: false };
const rivals = [0xf43f5e, 0x22d3ee, 0xfacc15].map((c, i) => ({ mesh: makeCar(c), t: 0, speed: 0, top: 46 + i * 3 + Math.random() * 3, lane: (i - 1) * 4.5, laps: 0, prog: 0, done: false }));

let state = 'title', raceTime = 0, countdown = 0, best = 0;
try { best = Number(localStorage.getItem('bestTime') || 0); } catch (e) {}
const LAPS = 3;
const input = { left: false, right: false, gas: false, brake: false };

function placeAtStart() {
  const p0 = pts[N - 12], t0 = tangents[N - 12], n0 = normals[N - 12];
  player.x = p0.x + n0.x * -3; player.z = p0.z + n0.z * -3; player.heading = Math.atan2(t0.x, t0.z);
  player.speed = 0; player.idx = N - 12; player.laps = 0; player.prog = -12; player.boost = 0; player.done = false;
  rivals.forEach((r, i) => { r.t = N - 18 - i * 6; r.speed = 0; r.laps = 0; r.prog = r.t - N; r.done = false; });
  raceTime = 0;
}
function start() { placeAtStart(); state = 'count'; countdown = 3; $('overlay').style.display = 'none'; PREFLY.sfx('click'); showPads(true); }
function showPads(on) { const v = on && touch ? 'flex' : 'none'; $('padL').style.display = v; $('padR').style.display = v; $('pause').style.display = on ? 'block' : 'none'; }
function overlay(title, text, btn) { $('ovTitle').textContent = title; $('ovText').textContent = text; $('ovBtn').textContent = btn; $('overlay').style.display = 'flex'; }
$('ovBtn').style.background = C[2];
$('ovBtn').addEventListener('click', () => { if (state === 'pause') { state = 'race'; $('overlay').style.display = 'none'; } else start(); });
$('pause').addEventListener('click', () => { if (state === 'race') { state = 'pause'; overlay(T.paused, '', T.play); } });
overlay(CFG.title, T.goal + ' ' + (touch ? T.touch : T.keys), T.play);

const keyMap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake' };
window.addEventListener('keydown', (e) => {
  if (keyMap[e.code]) { input[keyMap[e.code]] = true; e.preventDefault(); }
  if ((e.code === 'Enter' || e.code === 'Space') && (state === 'title' || state === 'fin')) start();
  else if ((e.code === 'KeyP' || e.code === 'Escape') && state === 'race') { state = 'pause'; overlay(T.paused, '', T.play); }
  else if ((e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Enter') && state === 'pause') { state = 'race'; $('overlay').style.display = 'none'; }
});
window.addEventListener('keyup', (e) => { if (keyMap[e.code]) input[keyMap[e.code]] = false; });
document.querySelectorAll('.pad button').forEach((b) => {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', (e) => { input[k] = true; b.classList.add('on'); b.setPointerCapture(e.pointerId); });
  const off = () => { input[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'race') { state = 'pause'; overlay(T.paused, '', T.play); } });

function nearest(x, z, from) {
  let bestI = from, bestD = Infinity;
  for (let o = -25; o <= 25; o++) { const i = (from + o + N) % N, p = pts[i]; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bestD) { bestD = d; bestI = i; } }
  return { i: bestI, d: Math.sqrt(bestD) };
}
function advance(car, newIdx) {
  let delta = newIdx - (((car.prog % N) + N) % N);
  if (delta < -N / 2) delta += N; if (delta > N / 2) delta -= N;
  car.prog += delta;
  const lap = Math.floor(car.prog / N);
  if (lap > car.laps) { car.laps = lap; return true; }
  return false;
}
const fmt = (t) => Math.floor(t / 60) + ':' + (t % 60).toFixed(2).padStart(5, '0');

function finish() {
  state = 'fin'; showPads(false);
  const place = 1 + rivals.filter((r) => r.prog > player.prog).length;
  if (place === 1 && (!best || raceTime < best)) { best = raceTime; try { localStorage.setItem('bestTime', String(best)); } catch (e) {} }
  PREFLY.sfx(place === 1 ? 'win' : 'lose');
  overlay(T.fin + ' #' + place, fmt(raceTime) + (best ? '   ·   ' + T.best + ' ' + fmt(best) : ''), T.again);
}

function update(dt) {
  if (state === 'count') {
    const before = Math.ceil(countdown); countdown -= dt;
    if (Math.ceil(countdown) !== before) PREFLY.sfx(countdown <= 0 ? 'powerup' : 'click');
    if (countdown <= 0) state = 'race';
  }
  if (state === 'race') {
    raceTime += dt;
    const near = nearest(player.x, player.z, player.idx);
    player.idx = near.i;
    const off = near.d > ROAD / 2 + 0.5;
    const top = (off ? 22 : 52) + (player.boost > 0 ? 22 : 0);
    if (input.gas) player.speed += 30 * dt; else if (input.brake) player.speed -= 45 * dt; else player.speed -= 8 * dt;
    if (player.speed > top) player.speed -= 40 * dt;
    player.speed = Math.max(-10, player.speed);
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    player.heading += steer * dt * 1.9 * Math.min(1, Math.abs(player.speed) / 12) * Math.sign(player.speed || 1);
    player.x += Math.sin(player.heading) * player.speed * dt; player.z += Math.cos(player.heading) * player.speed * dt;
    player.boost = Math.max(0, player.boost - dt);
    for (const pi of pads) if (Math.abs(player.idx - pi) < 3 && near.d < 4 && player.boost <= 0.5) { player.boost = 1.6; player.speed += 14; PREFLY.sfx('powerup', 0.6); }
    if (advance(player, player.idx) && player.laps >= LAPS) finish();
    for (const r of rivals) {
      if (r.done) continue;
      r.speed = Math.min(r.top, r.speed + 22 * dt);
      r.t = (r.t + r.speed * dt / (curve.getLength() / N) + N) % N;
      if (advance(r, Math.floor(r.t)) && r.laps >= LAPS) r.done = true;
    }
  }
  const pm = player.mesh;
  pm.position.set(player.x, 0, player.z); pm.rotation.y = player.heading;
  for (const r of rivals) {
    const i = Math.floor(r.t) % N, f = r.t - Math.floor(r.t), a = pts[i], b = pts[(i + 1) % N], n = normals[i];
    r.mesh.position.set(a.x + (b.x - a.x) * f + n.x * r.lane, 0, a.z + (b.z - a.z) * f + n.z * r.lane);
    r.mesh.rotation.y = Math.atan2(tangents[i].x, tangents[i].z);
  }
  const back = new THREE.Vector3(-Math.sin(player.heading) * 11, 5.2, -Math.cos(player.heading) * 11);
  camera.position.lerp(pm.position.clone().add(back), Math.min(1, dt * 5));
  camera.lookAt(pm.position.x, 1.5, pm.position.z);
  sun.position.set(pm.position.x + 40, 90, pm.position.z + 30); sun.target.position.copy(pm.position);
  const place = 1 + rivals.filter((r) => r.prog > player.prog).length;
  $('lap').textContent = T.lap + ' ' + Math.min(LAPS, player.laps + 1) + '/' + LAPS + '  ' + fmt(raceTime);
  $('pos').textContent = state === 'count' ? String(Math.ceil(countdown)) : T.pos + ' ' + place + '/4';
  $('spd').textContent = Math.round(Math.max(0, player.speed) * 3.6) + ' km/h';
}

placeAtStart();
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
  if (state !== 'pause') update(dt);
  renderer.render(scene, camera);
});
</script>
</body>
</html>`;
