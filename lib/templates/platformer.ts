/** Demo template: a 2D platformer (used when no Anthropic API key is configured). */
export const PLATFORMER = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>__TITLE__</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#0b1020;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
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
    ? { play: 'שחקו', goal: 'אספו בלוטים, קפצו על אויבים והגיעו לדגל!', keys: 'חיצים / WASD לתנועה, רווח לקפיצה (קפיצה כפולה!)', touch: 'כפתורים על המסך', level: 'שלב', score: 'ניקוד', over: 'המשחק נגמר', win: 'ניצחתם!', best: 'שיא', again: 'שחקו שוב', paused: 'הפסקה' }
    : { play: 'Play', goal: 'Collect acorns, stomp enemies and reach the flag!', keys: 'Arrows / WASD to move, Space to jump (double jump!)', touch: 'On-screen buttons', level: 'Level', score: 'Score', over: 'Game over', win: 'You win!', best: 'Best', again: 'Play again', paused: 'Paused' };
  var C = CFG.colors;
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = 1, S = 1;
  var VIEW_H = 600;
  var touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    S = H / VIEW_H;
  }
  window.addEventListener('resize', resize); resize();

  var best = 0;
  try { best = Number(localStorage.getItem('best') || 0); } catch (e) {}

  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function buildLevel(n) {
    var r = rng(7 + n * 101);
    var plats = [], coins = [], enemies = [];
    var x = 0;
    plats.push([x, 520, 700, 80]); x += 700;
    var len = 4200 + n * 1400;
    while (x < len) {
      var gap = 90 + r() * (60 + n * 25);
      x += gap;
      var w = 260 + r() * 420;
      var y = 440 + r() * 110;
      plats.push([x, y, w, 600 - y]);
      if (w > 380 && r() < 0.5 + n * 0.15) enemies.push({ x: x + w / 2, y: y - 30, min: x + 10, max: x + w - 40, vx: 70 + n * 25, alive: true, t: r() * 6 });
      for (var i = 0; i < 3; i++) coins.push({ x: x + w * (0.25 + i * 0.25), y: y - 60, got: false });
      if (r() < 0.55) {
        var fy = y - 140 - r() * 60, fw = 140 + r() * 120, fx = x + r() * (w - fw);
        plats.push([fx, fy, fw, 22]);
        coins.push({ x: fx + fw / 2, y: fy - 45, got: false });
      }
      x += w;
    }
    plats.push([x + 120, 520, 600, 80]);
    return { plats: plats, coins: coins, enemies: enemies, goal: x + 420, width: x + 720 };
  }

  var state = 'title', levelIndex = 0, L = null, score = 0, lives = 3, camX = 0, shake = 0, time = 0;
  var p = { x: 80, y: 400, vx: 0, vy: 0, w: 34, h: 44, ground: false, jumps: 0, face: 1, inv: 0 };
  var particles = [], floaters = [];
  var keys = {}, tl = false, tr = false, tj = false, jumpQueued = false;

  function startLevel(i) {
    levelIndex = i; L = buildLevel(i);
    p.x = 80; p.y = 400; p.vx = 0; p.vy = 0; p.inv = 1; camX = 0;
  }
  function newGame() { score = 0; lives = 3; startLevel(0); state = 'play'; PREFLY.sfx('click'); }
  function burst(x, y, color, n) { for (var i = 0; i < n; i++) particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 380, life: 0.6 + Math.random() * 0.4, c: color }); }
  function floatText(x, y, text) { floaters.push({ x: x, y: y, text: text, life: 1 }); }
  function hurt() {
    if (p.inv > 0) return;
    lives--; shake = 0.4; PREFLY.sfx('hit'); burst(p.x + 17, p.y + 22, C[1], 20);
    if (lives <= 0) { end('over'); return; }
    p.x = Math.max(80, camX + 80); p.y = 200; p.vx = 0; p.vy = 0; p.inv = 2;
    for (var i = 0; i < L.plats.length; i++) { var q = L.plats[i]; if (p.x + 17 >= q[0] && p.x + 17 <= q[0] + q[2]) { p.y = q[1] - p.h - 2; break; } }
  }
  function end(kind) {
    state = kind;
    if (score > best) { best = score; try { localStorage.setItem('best', String(best)); } catch (e) {} }
    PREFLY.sfx(kind === 'win' ? 'win' : 'lose');
  }
  function jump() {
    if (p.ground || p.jumps < 2) {
      p.vy = p.jumps === 0 ? -820 : -720; p.jumps++; p.ground = false;
      PREFLY.sfx('jump'); burst(p.x + 17, p.y + p.h, '#ffffff', 6);
    }
  }

  window.addEventListener('keydown', function (e) {
    var k = e.code;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(k) >= 0) e.preventDefault();
    if (state === 'play' && (k === 'KeyP' || k === 'Escape')) { state = 'pause'; return; }
    if (state === 'pause' && (k === 'KeyP' || k === 'Escape' || k === 'Enter' || k === 'Space')) { state = 'play'; return; }
    if (state !== 'play' && (k === 'Enter' || k === 'Space')) { newGame(); return; }
    if (!keys[k] && (k === 'Space' || k === 'ArrowUp' || k === 'KeyW')) jumpQueued = true;
    keys[k] = true;
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });

  function buttons() {
    var r = Math.min(W, H) * 0.09 + 20;
    return { left: { x: r * 1.2, y: H - r * 1.3, r: r }, right: { x: r * 3.5, y: H - r * 1.3, r: r }, jump: { x: W - r * 1.4, y: H - r * 1.3, r: r * 1.15 }, pause: { x: W - 40, y: 40, r: 26 } };
  }
  var pointers = {};
  function updateTouch() {
    tl = tr = false; var j = false; var b = buttons();
    for (var id in pointers) {
      var q = pointers[id];
      if (Math.hypot(q.x - b.left.x, q.y - b.left.y) < b.left.r * 1.3) tl = true;
      if (Math.hypot(q.x - b.right.x, q.y - b.right.y) < b.right.r * 1.3) tr = true;
      if (Math.hypot(q.x - b.jump.x, q.y - b.jump.y) < b.jump.r * 1.3) j = true;
    }
    if (j && !tj) jumpQueued = true;
    tj = j;
  }
  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    if (state !== 'play' && state !== 'pause') { newGame(); return; }
    var b = buttons();
    if (Math.hypot(e.clientX - b.pause.x, e.clientY - b.pause.y) < b.pause.r * 1.4) { state = state === 'pause' ? 'play' : 'pause'; return; }
    if (state === 'pause') { state = 'play'; return; }
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY }; updateTouch();
  });
  cv.addEventListener('pointermove', function (e) { if (pointers[e.pointerId]) { pointers[e.pointerId] = { x: e.clientX, y: e.clientY }; updateTouch(); } });
  function up(e) { delete pointers[e.pointerId]; updateTouch(); }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'play') state = 'pause'; });

  function collide(axis) {
    for (var i = 0; i < L.plats.length; i++) {
      var q = L.plats[i];
      if (p.x < q[0] + q[2] && p.x + p.w > q[0] && p.y < q[1] + q[3] && p.y + p.h > q[1]) {
        if (axis === 'x') { if (p.vx > 0) p.x = q[0] - p.w; else if (p.vx < 0) p.x = q[0] + q[2]; p.vx = 0; }
        else { if (p.vy > 0) { p.y = q[1] - p.h; p.ground = true; p.jumps = 0; } else if (p.vy < 0) p.y = q[1] + q[3]; p.vy = 0; }
      }
    }
  }

  function update(dt) {
    time += dt;
    for (var i = particles.length - 1; i >= 0; i--) { var a = particles[i]; a.life -= dt; a.vy += 900 * dt; a.x += a.vx * dt; a.y += a.vy * dt; if (a.life <= 0) particles.splice(i, 1); }
    for (var f = floaters.length - 1; f >= 0; f--) { floaters[f].life -= dt; floaters[f].y -= 50 * dt; if (floaters[f].life <= 0) floaters.splice(f, 1); }
    shake = Math.max(0, shake - dt);
    if (state !== 'play') return;
    var left = keys.ArrowLeft || keys.KeyA || tl, right = keys.ArrowRight || keys.KeyD || tr;
    var target = (right ? 1 : 0) - (left ? 1 : 0);
    if (target) p.face = target;
    p.vx += (target * 340 - p.vx) * Math.min(1, dt * (p.ground ? 12 : 6));
    if (jumpQueued) { jump(); jumpQueued = false; }
    p.vy = Math.min(p.vy + 2200 * dt, 1400);
    p.inv = Math.max(0, p.inv - dt);
    p.x += p.vx * dt; p.x = Math.max(0, p.x); collide('x');
    p.ground = false; p.y += p.vy * dt; collide('y');
    if (p.y > 760) hurt();
    for (var c = 0; c < L.coins.length; c++) {
      var co = L.coins[c];
      if (!co.got && Math.abs(co.x - (p.x + 17)) < 30 && Math.abs(co.y - (p.y + 22)) < 34) { co.got = true; score += 10; PREFLY.sfx('coin'); burst(co.x, co.y, C[2], 10); floatText(co.x, co.y, '+10'); }
    }
    for (var e = 0; e < L.enemies.length; e++) {
      var en = L.enemies[e];
      if (!en.alive) continue;
      en.t += dt; en.x += en.vx * dt;
      if (en.x < en.min || en.x > en.max) { en.vx = -en.vx; en.x = Math.max(en.min, Math.min(en.max, en.x)); }
      if (p.x < en.x + 36 && p.x + p.w > en.x && p.y < en.y + 30 && p.y + p.h > en.y) {
        if (p.vy > 0 && p.y + p.h - en.y < 26) { en.alive = false; p.vy = -560; score += 100; shake = 0.15; PREFLY.sfx('explosion', 0.5); burst(en.x + 18, en.y + 15, C[0], 18); floatText(en.x, en.y, '+100'); }
        else hurt();
      }
    }
    if (p.x > L.goal) {
      score += 250 * (levelIndex + 1); PREFLY.sfx('powerup');
      if (levelIndex >= 2) end('win'); else startLevel(levelIndex + 1);
    }
    var want = p.x - (W / S) * 0.35;
    camX += (want - camX) * Math.min(1, dt * 6);
    camX = Math.max(0, Math.min(camX, L.width - W / S));
  }

  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawPlayer() {
    var x = p.x, y = p.y;
    if (p.inv > 0 && Math.floor(time * 12) % 2) return;
    ctx.save(); ctx.translate(x + 17, y + 22); ctx.scale(p.face, 1);
    var squash = p.ground ? 1 : 1 + Math.min(0.15, Math.abs(p.vy) / 4000);
    ctx.scale(1 / squash, squash);
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.ellipse(-20, 6, 14, 7, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff7ed'; ctx.beginPath(); ctx.ellipse(-30, 2, 5, 4, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f97316'; roundRect(-14, -8, 28, 28, 10); ctx.fill();
    ctx.beginPath(); ctx.arc(4, -14, 14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6, -24); ctx.lineTo(-2, -38); ctx.lineTo(4, -26); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -26); ctx.lineTo(14, -38); ctx.lineTo(16, -22); ctx.fill();
    ctx.fillStyle = '#fff7ed'; ctx.beginPath(); ctx.ellipse(12, -9, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(8, -16, 2.6, 0, Math.PI * 2); ctx.arc(19, -10, 2.4, 0, Math.PI * 2); ctx.fill();
    var leg = p.ground && Math.abs(p.vx) > 30 ? Math.sin(time * 18) * 5 : 0;
    ctx.fillStyle = '#7c2d12'; roundRect(-10 + leg, 18, 9, 6, 3); ctx.fill(); roundRect(3 - leg, 18, 9, 6, 3); ctx.fill();
    ctx.restore();
  }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C[0]); g.addColorStop(1, C[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (var layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)';
      var off = -(camX * (layer ? 0.35 : 0.15) * S) % (500 * S);
      for (var hx = off - 500 * S; hx < W + 500 * S; hx += 500 * S) { ctx.beginPath(); ctx.ellipse(hx + 250 * S, H * (layer ? 0.88 : 0.78), 320 * S, (layer ? 160 : 220) * S, 0, Math.PI, 0); ctx.fill(); }
    }
    var sx = shake > 0 ? (Math.random() - 0.5) * 12 : 0, sy = shake > 0 ? (Math.random() - 0.5) * 12 : 0;
    ctx.setTransform(DPR * S, 0, 0, DPR * S, (-camX * S + sx) * DPR, sy * DPR);
    if (L) {
      for (var i = 0; i < L.plats.length; i++) {
        var q = L.plats[i];
        ctx.fillStyle = '#7c4a2d'; roundRect(q[0], q[1], q[2], q[3], 8); ctx.fill();
        ctx.fillStyle = C[3] || '#4ade80'; roundRect(q[0] - 2, q[1] - 4, q[2] + 4, 16, 8); ctx.fill();
      }
      ctx.fillStyle = '#e5e7eb'; ctx.fillRect(L.goal, 360, 6, 160);
      ctx.fillStyle = C[2]; ctx.beginPath(); ctx.moveTo(L.goal + 6, 362); ctx.lineTo(L.goal + 66 + Math.sin(time * 6) * 4, 382); ctx.lineTo(L.goal + 6, 402); ctx.fill();
      for (var c = 0; c < L.coins.length; c++) {
        var co = L.coins[c]; if (co.got) continue;
        var wob = Math.abs(Math.cos(time * 3 + c));
        ctx.fillStyle = '#a16207'; ctx.beginPath(); ctx.ellipse(co.x, co.y + 3 + Math.sin(time * 4 + c) * 3, 11 * wob + 2, 13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C[2]; ctx.beginPath(); ctx.ellipse(co.x, co.y - 9 + Math.sin(time * 4 + c) * 3, 12 * wob + 2, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      for (var e = 0; e < L.enemies.length; e++) {
        var en = L.enemies[e]; if (!en.alive) continue;
        var bob = Math.sin(en.t * 10) * 2;
        ctx.fillStyle = '#7c3aed'; roundRect(en.x, en.y + bob, 36, 30, 14); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(en.x + 12, en.y + 11 + bob, 6, 0, 7); ctx.arc(en.x + 25, en.y + 11 + bob, 6, 0, 7); ctx.fill();
        ctx.fillStyle = '#111'; var d = en.vx > 0 ? 2 : -2; ctx.beginPath(); ctx.arc(en.x + 12 + d, en.y + 12 + bob, 2.6, 0, 7); ctx.arc(en.x + 25 + d, en.y + 12 + bob, 2.6, 0, 7); ctx.fill();
      }
      drawPlayer();
    }
    for (var k = 0; k < particles.length; k++) { var a = particles[k]; ctx.globalAlpha = Math.max(0, a.life); ctx.fillStyle = a.c; ctx.fillRect(a.x - 3, a.y - 3, 6, 6); }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center';
    for (var f = 0; f < floaters.length; f++) { ctx.globalAlpha = floaters[f].life; ctx.fillStyle = '#fff'; ctx.fillText(floaters[f].text, floaters[f].x, floaters[f].y); }
    ctx.globalAlpha = 1;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.direction = HE ? 'rtl' : 'ltr';
    if (state === 'play' || state === 'pause') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(12, 12, 250, 46, 14); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px system-ui'; ctx.textAlign = 'left'; ctx.direction = 'ltr';
      ctx.fillText('★ ' + score + '   ♥ ' + lives + '   ' + T.level + ' ' + (levelIndex + 1), 26, 42);
      var b = buttons();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(b.pause.x, b.pause.y, b.pause.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(b.pause.x - 8, b.pause.y - 10, 6, 20); ctx.fillRect(b.pause.x + 2, b.pause.y - 10, 6, 20);
      if (touch) {
        [['left', '◀', tl], ['right', '▶', tr], ['jump', '⤒', tj]].forEach(function (it) {
          var bb = b[it[0]]; ctx.fillStyle = it[2] ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.22)';
          ctx.beginPath(); ctx.arc(bb.x, bb.y, bb.r, 0, 7); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(bb.r * 0.8) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it[1], bb.x, bb.y + 2); ctx.textBaseline = 'alphabetic';
        });
      }
      if (state === 'pause') overlay(T.paused, '', T.play);
    } else if (state === 'title') overlay(CFG.title, T.goal + '\n' + (touch ? T.touch : T.keys), T.play);
    else overlay(state === 'win' ? T.win : T.over, T.score + ': ' + score + '   ' + T.best + ': ' + best, T.again);
  }
  function overlay(title, sub, btn) {
    ctx.fillStyle = 'rgba(8,10,25,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.direction = HE ? 'rtl' : 'ltr'; ctx.fillStyle = '#fff';
    ctx.font = '800 ' + Math.round(Math.min(W / 9, 64)) + 'px system-ui'; ctx.fillText(title, W / 2, H * 0.36);
    ctx.font = Math.round(Math.min(W / 30, 18)) + 'px system-ui';
    sub.split('\n').forEach(function (line, i) { ctx.fillText(line, W / 2, H * 0.36 + 44 + i * 28); });
    var bw = 200, bh = 58, bx = W / 2 - bw / 2, by = H * 0.6;
    ctx.fillStyle = C[2]; roundRect(bx, by, bw, bh, 29); ctx.fill();
    ctx.fillStyle = '#1f1300'; ctx.font = 'bold 22px system-ui'; ctx.fillText(btn, W / 2, by + 37);
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    update(dt); draw();
    requestAnimationFrame(frame);
  }
  PREFLY.ready.then(function () { startLevel(0); requestAnimationFrame(frame); });
})();
</script>
</body>
</html>`;
