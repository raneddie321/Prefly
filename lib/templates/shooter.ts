/** Demo template: an arcade space shooter (used when no Anthropic API key is configured). */
export const SHOOTER = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>__TITLE__</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#05010f;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
canvas{display:block;width:100vw;height:100vh}
</style>
</head>
<body>
<canvas id="game"></canvas>
<script>
(function () {
  var CFG = __CONFIG__;
  var HE = PREFLY.locale === 'he';
  var T = HE
    ? { play: 'שחקו', goal: 'הפילו את גלי האויבים ואספו חיזוקים!', keys: 'חיצים / WASD לתנועה — הירי אוטומטי', touch: 'גררו את האצבע כדי להזיז את החללית', wave: 'גל', over: 'המשחק נגמר', best: 'שיא', score: 'ניקוד', again: 'שחקו שוב', paused: 'הפסקה' }
    : { play: 'Play', goal: 'Blast the enemy waves and grab power-ups!', keys: 'Arrows / WASD to move — firing is automatic', touch: 'Drag your finger to steer the ship', wave: 'Wave', over: 'Game over', best: 'Best', score: 'Score', again: 'Play again', paused: 'Paused' };
  var C = CFG.colors;
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1;
  function resize() { DPR = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight; cv.width = W * DPR; cv.height = H * DPR; }
  window.addEventListener('resize', resize); resize();
  var touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  var best = 0;
  try { best = Number(localStorage.getItem('best') || 0); } catch (e) {}
  var stars = [];
  for (var i = 0; i < 140; i++) stars.push({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 1.2 });

  var state = 'title', score = 0, lives = 3, wave = 0, time = 0, shake = 0;
  var ship, bullets, enemies, shots, parts, powerups, waveTimer;
  var keys = {}, drag = null;

  function reset() {
    ship = { x: W / 2, y: H * 0.82, r: 20, cool: 0, inv: 2, triple: 0, shield: 0 };
    bullets = []; enemies = []; shots = []; parts = []; powerups = [];
    score = 0; lives = 3; wave = 0; waveTimer = 0.5;
  }
  function start() { reset(); state = 'play'; PREFLY.sfx('click'); }
  function boom(x, y, color, n) { for (var i = 0; i < n; i++) { var a = Math.random() * 6.28, s = 60 + Math.random() * 320; parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.5, c: color }); } }
  function spawnWave() {
    wave++;
    var n = 5 + wave * 2, kind = wave % 3;
    for (var i = 0; i < n; i++) {
      enemies.push({
        x: W * (0.1 + 0.8 * ((i + 0.5) / n)), y: -40 - (i % 3) * 50 - Math.random() * 40, baseX: 0,
        r: kind === 2 ? 22 : 17, hp: kind === 2 ? 3 : 1, t: Math.random() * 6, kind: kind,
        speed: 50 + wave * 6 + Math.random() * 30, fire: 1 + Math.random() * 3
      });
      enemies[enemies.length - 1].baseX = enemies[enemies.length - 1].x;
    }
  }
  function hit() {
    if (ship.inv > 0) return;
    if (ship.shield > 0) { ship.shield = 0; ship.inv = 1; PREFLY.sfx('hit', 0.6); return; }
    lives--; shake = 0.5; ship.inv = 2; PREFLY.sfx('explosion'); boom(ship.x, ship.y, C[1], 40);
    if (lives <= 0) {
      state = 'over';
      if (score > best) { best = score; try { localStorage.setItem('best', String(best)); } catch (e) {} }
      PREFLY.sfx('lose');
    }
  }

  window.addEventListener('keydown', function (e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    if (state === 'play' && (e.code === 'KeyP' || e.code === 'Escape')) { state = 'pause'; return; }
    if (state === 'pause' && (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space')) { state = 'play'; return; }
    if ((state === 'title' || state === 'over') && (e.code === 'Enter' || e.code === 'Space')) { start(); return; }
    keys[e.code] = true;
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    if (state === 'title' || state === 'over') { start(); return; }
    if (Math.hypot(e.clientX - (W - 40), e.clientY - 40) < 36) { state = state === 'pause' ? 'play' : 'pause'; return; }
    if (state === 'pause') { state = 'play'; return; }
    drag = { id: e.pointerId, px: e.clientX, py: e.clientY, sx: ship.x, sy: ship.y };
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag || drag.id !== e.pointerId) return;
    ship.x = drag.sx + (e.clientX - drag.px) * 1.3; ship.y = drag.sy + (e.clientY - drag.py) * 1.3;
  });
  function up(e) { if (drag && drag.id === e.pointerId) drag = null; }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'play') state = 'pause'; });

  function update(dt) {
    time += dt; shake = Math.max(0, shake - dt);
    for (var s = 0; s < stars.length; s++) { stars[s].y += dt * 0.05 * stars[s].z * (state === 'play' ? 2 : 1); if (stars[s].y > 1) { stars[s].y = 0; stars[s].x = Math.random(); } }
    for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; if (p.life <= 0) parts.splice(i, 1); }
    if (state !== 'play') return;
    var mx = ((keys.ArrowRight || keys.KeyD) ? 1 : 0) - ((keys.ArrowLeft || keys.KeyA) ? 1 : 0);
    var my = ((keys.ArrowDown || keys.KeyS) ? 1 : 0) - ((keys.ArrowUp || keys.KeyW) ? 1 : 0);
    ship.x += mx * 460 * dt; ship.y += my * 460 * dt;
    ship.x = Math.max(24, Math.min(W - 24, ship.x)); ship.y = Math.max(H * 0.3, Math.min(H - 30, ship.y));
    ship.inv = Math.max(0, ship.inv - dt); ship.triple = Math.max(0, ship.triple - dt); ship.shield = Math.max(0, ship.shield - dt);
    ship.cool -= dt;
    if (ship.cool <= 0) {
      ship.cool = 0.16;
      bullets.push({ x: ship.x, y: ship.y - 22, vx: 0 });
      if (ship.triple > 0) { bullets.push({ x: ship.x, y: ship.y - 18, vx: -160 }); bullets.push({ x: ship.x, y: ship.y - 18, vx: 160 }); }
      PREFLY.sfx('shoot', 0.25);
    }
    for (var b = bullets.length - 1; b >= 0; b--) { var bu = bullets[b]; bu.y -= 760 * dt; bu.x += bu.vx * dt; if (bu.y < -20) bullets.splice(b, 1); }
    if (!enemies.length) { waveTimer -= dt; if (waveTimer <= 0) { spawnWave(); waveTimer = 1.2; } }
    for (var e = enemies.length - 1; e >= 0; e--) {
      var en = enemies[e];
      en.t += dt; en.y += en.speed * dt;
      en.x = en.baseX + Math.sin(en.t * (en.kind === 1 ? 2.4 : 1.3)) * (en.kind === 1 ? 90 : 40);
      en.fire -= dt;
      if (en.fire <= 0 && en.y > 0) { en.fire = 2.2 + Math.random() * 2.5 - Math.min(1.2, wave * 0.08); var ang = Math.atan2(ship.y - en.y, ship.x - en.x); shots.push({ x: en.x, y: en.y, vx: Math.cos(ang) * 230, vy: Math.sin(ang) * 230 }); }
      if (en.y > H + 40) { en.y = -40; }
      for (var k = bullets.length - 1; k >= 0; k--) {
        if (Math.hypot(bullets[k].x - en.x, bullets[k].y - en.y) < en.r + 6) {
          bullets.splice(k, 1); en.hp--; boom(en.x, en.y, '#fff', 4);
          if (en.hp <= 0) {
            score += en.kind === 2 ? 50 : 20; PREFLY.sfx('explosion', 0.35); boom(en.x, en.y, en.kind === 2 ? C[2] : C[1], 22); shake = Math.max(shake, 0.12);
            if (Math.random() < 0.12) powerups.push({ x: en.x, y: en.y, kind: Math.random() < 0.5 ? 'triple' : 'shield' });
            enemies.splice(e, 1);
          }
          break;
        }
      }
      if (enemies[e] === en && Math.hypot(en.x - ship.x, en.y - ship.y) < en.r + ship.r - 4) { hit(); en.hp = 0; boom(en.x, en.y, C[1], 20); enemies.splice(e, 1); }
    }
    for (var q = shots.length - 1; q >= 0; q--) { var sh = shots[q]; sh.x += sh.vx * dt; sh.y += sh.vy * dt; if (Math.hypot(sh.x - ship.x, sh.y - ship.y) < ship.r) { shots.splice(q, 1); hit(); } else if (sh.y > H + 20 || sh.y < -20 || sh.x < -20 || sh.x > W + 20) shots.splice(q, 1); }
    for (var u = powerups.length - 1; u >= 0; u--) {
      var pu = powerups[u]; pu.y += 120 * dt;
      if (Math.hypot(pu.x - ship.x, pu.y - ship.y) < 34) { if (pu.kind === 'triple') ship.triple = 10; else ship.shield = 12; PREFLY.sfx('powerup'); powerups.splice(u, 1); }
      else if (pu.y > H + 30) powerups.splice(u, 1);
    }
  }

  function drawShip(x, y) {
    ctx.save(); ctx.translate(x, y);
    var flame = 10 + Math.random() * 8;
    ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.moveTo(-7, 16); ctx.lineTo(0, 16 + flame); ctx.lineTo(7, 16); ctx.fill();
    var g = ctx.createLinearGradient(0, -24, 0, 18); g.addColorStop(0, '#ffffff'); g.addColorStop(1, C[1]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(18, 16); ctx.lineTo(0, 9); ctx.lineTo(-18, 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C[2]; ctx.beginPath(); ctx.ellipse(0, -4, 5, 9, 0, 0, 7); ctx.fill();
    if (ship.shield > 0) { ctx.strokeStyle = 'rgba(125,211,252,' + (0.5 + Math.sin(time * 8) * 0.3) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 32, 0, 7); ctx.stroke(); }
    ctx.restore();
  }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05010f'); g.addColorStop(1, C[0]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (var s = 0; s < stars.length; s++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + stars[s].z * 0.5) + ')'; ctx.fillRect(stars[s].x * W, stars[s].y * H, stars[s].z * 2, stars[s].z * 2); }
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 14 * shake * 2, (Math.random() - 0.5) * 14 * shake * 2);
    if (ship && (state === 'play' || state === 'pause')) {
      for (var b = 0; b < bullets.length; b++) { ctx.fillStyle = C[2]; ctx.fillRect(bullets[b].x - 2, bullets[b].y - 10, 4, 14); }
      for (var q = 0; q < shots.length; q++) { ctx.fillStyle = '#f87171'; ctx.beginPath(); ctx.arc(shots[q].x, shots[q].y, 5, 0, 7); ctx.fill(); }
      for (var e = 0; e < enemies.length; e++) {
        var en = enemies[e];
        ctx.save(); ctx.translate(en.x, en.y);
        ctx.fillStyle = en.kind === 2 ? '#f43f5e' : en.kind === 1 ? '#22d3ee' : '#a3e635';
        ctx.beginPath(); ctx.moveTo(0, en.r); ctx.lineTo(en.r, -en.r * 0.4); ctx.lineTo(en.r * 0.4, -en.r); ctx.lineTo(-en.r * 0.4, -en.r); ctx.lineTo(-en.r, -en.r * 0.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(0, -2, en.r * 0.35, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -2, en.r * 0.14, 0, 7); ctx.fill();
        ctx.restore();
      }
      for (var u = 0; u < powerups.length; u++) {
        var pu = powerups[u];
        ctx.fillStyle = pu.kind === 'triple' ? C[2] : '#7dd3fc'; ctx.beginPath(); ctx.arc(pu.x, pu.y, 14 + Math.sin(time * 6) * 2, 0, 7); ctx.fill();
        ctx.fillStyle = '#111'; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(pu.kind === 'triple' ? '3' : 'S', pu.x, pu.y + 1); ctx.textBaseline = 'alphabetic';
      }
      if (!(ship.inv > 0 && Math.floor(time * 12) % 2)) drawShip(ship.x, ship.y);
    }
    for (var i = 0; i < parts.length; i++) { var p = parts[i]; ctx.globalAlpha = Math.max(0, p.life * 1.6); ctx.fillStyle = p.c; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
    ctx.globalAlpha = 1;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (state === 'play' || state === 'pause') {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px system-ui'; ctx.textAlign = 'left'; ctx.direction = 'ltr';
      ctx.fillText('★ ' + score + '   ♥ ' + lives + '   ' + T.wave + ' ' + wave, 18, 36);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(W - 40, 40, 24, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(W - 48, 30, 6, 20); ctx.fillRect(W - 38, 30, 6, 20);
      if (state === 'pause') overlay(T.paused, '', T.play);
    } else if (state === 'title') overlay(CFG.title, T.goal + '\n' + (touch ? T.touch : T.keys), T.play);
    else overlay(T.over, T.score + ': ' + score + '   ' + T.best + ': ' + best, T.again);
  }
  function overlay(title, sub, btn) {
    ctx.fillStyle = 'rgba(5,1,15,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.direction = HE ? 'rtl' : 'ltr'; ctx.fillStyle = '#fff';
    ctx.font = '800 ' + Math.round(Math.min(W / 9, 64)) + 'px system-ui'; ctx.fillText(title, W / 2, H * 0.36);
    ctx.font = Math.round(Math.min(W / 30, 18)) + 'px system-ui';
    sub.split('\n').forEach(function (line, i) { ctx.fillText(line, W / 2, H * 0.36 + 44 + i * 28); });
    ctx.fillStyle = C[2]; ctx.beginPath(); ctx.arc(W / 2 - 70, H * 0.6 + 29, 29, Math.PI / 2, Math.PI * 1.5); ctx.lineTo(W / 2 + 70, H * 0.6); ctx.arc(W / 2 + 70, H * 0.6 + 29, 29, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = 'bold 22px system-ui'; ctx.fillText(btn, W / 2, H * 0.6 + 37);
  }
  var last = performance.now();
  function frame(now) { var dt = Math.min((now - last) / 1000, 1 / 30); last = now; update(dt); draw(); requestAnimationFrame(frame); }
  PREFLY.ready.then(function () { reset(); requestAnimationFrame(frame); });
})();
</script>
</body>
</html>`;
