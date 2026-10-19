/**
 * The Prefly in-game runtime. It is injected (as one line, so error line
 * numbers still match the game file) at the top of every game's <head> and
 * exposes the global `PREFLY` API that generated games rely on:
 *
 *  - error capture  -> forwards runtime errors to the studio's QA agent
 *  - storage shim   -> localStorage that works inside sandboxed iframes and is
 *                      persisted by the parent page
 *  - assets         -> PREFLY.images / PREFLY.ready for AI-drawn SVG sprites
 *  - sfx            -> small WebAudio synthesizer
 *  - share          -> asks the host page to share/copy text
 *  - multiplayer    -> real-time rooms over Supabase Realtime (BroadcastChannel
 *                      fallback when no backend is configured)
 *  - test mode      -> mutes audio and sends synthetic input for smoke tests
 *
 * Rules for this file: plain ES2017, explicit semicolons, no line comments,
 * no template literals (the source is collapsed to a single line).
 */
export const RUNTIME_SOURCE = String.raw`
(function () {
  var C = window.__PREFLY_CONFIG__ || {};
  var P = window.PREFLY = window.PREFLY || {};
  P.config = C;
  P.gameId = C.gameId || 'local';
  P.locale = C.locale || 'en';

  var embedded = false;
  try { embedded = window.parent && window.parent !== window; } catch (e) { embedded = true; }
  function post(msg) {
    if (!embedded) return;
    msg.source = 'prefly';
    try { window.parent.postMessage(msg, '*'); } catch (e) {}
  }

  var errorCount = 0;
  function report(kind, message, line, col, stack) {
    if (errorCount++ > 40) return;
    post({ type: 'error', kind: kind, message: String(message || 'Unknown error').slice(0, 600), line: line || 0, col: col || 0, stack: stack ? String(stack).slice(0, 2000) : '' });
  }
  P.reportError = report;
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) { report('resource', 'Failed to load ' + (t.src || t.href)); return; }
    report('error', e.message || (e.error && e.error.message) || 'Script error', e.lineno, e.colno, e.error && e.error.stack);
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    report('promise', 'Unhandled promise rejection: ' + ((r && (r.message || r)) || 'unknown'), 0, 0, r && r.stack);
  });
  var origError = console.error;
  console.error = function () {
    try {
      var parts = Array.prototype.map.call(arguments, function (a) {
        if (a instanceof Error) return a.message;
        if (typeof a === 'object') { try { return JSON.stringify(a); } catch (x) { return String(a); } }
        return String(a);
      });
      report('console', parts.join(' '));
    } catch (x) {}
    return origError.apply(console, arguments);
  };

  function memoryStorage(initial, onChange) {
    var d = {};
    if (initial) { Object.keys(initial).forEach(function (k) { d[k] = String(initial[k]); }); }
    var s = {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
      setItem: function (k, v) { d[String(k)] = String(v); if (onChange) onChange(d); },
      removeItem: function (k) { delete d[String(k)]; if (onChange) onChange(d); },
      clear: function () { d = {}; if (onChange) onChange(d); },
      key: function (i) { return Object.keys(d)[i] || null; }
    };
    Object.defineProperty(s, 'length', { get: function () { return Object.keys(d).length; } });
    return s;
  }
  var storageOk = false;
  try { window.localStorage.setItem('__prefly', '1'); window.localStorage.removeItem('__prefly'); storageOk = true; } catch (e) {}
  if (!storageOk) {
    var saveTimer = null;
    var local = memoryStorage(C.storage || {}, function (d) {
      if (C.test) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { post({ type: 'storage', data: d }); }, 250);
    });
    try { Object.defineProperty(window, 'localStorage', { value: local, configurable: true }); } catch (e) {}
    try { Object.defineProperty(window, 'sessionStorage', { value: memoryStorage({}), configurable: true }); } catch (e) {}
  }

  var assetMeta = C.assets || {};
  var images = {};
  var loads = [];
  P.assets = {};
  Object.keys(assetMeta).forEach(function (id) {
    var a = assetMeta[id];
    var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(a.svg || '');
    var img = new Image();
    if (a.width) { img.width = a.width; img.height = a.height; }
    loads.push(new Promise(function (resolve) {
      img.onload = function () { resolve(); };
      img.onerror = function () { console.warn('[Prefly] asset "' + id + '" could not be decoded'); resolve(); };
    }));
    img.src = url;
    images[id] = img;
    P.assets[id] = { id: id, width: a.width, height: a.height, description: a.description, url: url };
  });
  function placeholder() {
    var c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = '#8b5cf6'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(24, 26, 5, 0, Math.PI * 2); g.arc(40, 26, 5, 0, Math.PI * 2); g.fill();
    return c;
  }
  P.images = typeof Proxy === 'function' ? new Proxy(images, {
    get: function (t, k) {
      if (typeof k !== 'string' || k === 'then' || k === 'toJSON') return t[k];
      if (!(k in t)) { console.warn('[Prefly] unknown image asset "' + k + '", using a placeholder'); t[k] = placeholder(); }
      return t[k];
    }
  }) : images;
  P.ready = Promise.all(loads).then(function () { return P; });

  var actx = null;
  var master = null;
  function audio() {
    if (C.test) return null;
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC(); master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination); } catch (e) { return null; }
    }
    if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
    return actx;
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function () { if (actx && actx.state === 'suspended') { try { actx.resume(); } catch (e) {} } }, { passive: true });
  });
  function tone(a, type, f0, f1, dur, vol, delay) {
    var t = a.currentTime + (delay || 0);
    var o = a.createOscillator();
    var g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(a, dur, vol, cutoff, delay) {
    var t = a.currentTime + (delay || 0);
    var len = Math.floor(a.sampleRate * dur);
    var buf = a.createBuffer(1, len, a.sampleRate);
    var ch = buf.getChannelData(0);
    for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = a.createBufferSource();
    src.buffer = buf;
    var f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff || 2000;
    var g = a.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }
  P.sfx = function (name, volume) {
    var a = audio();
    if (!a) return;
    var v = typeof volume === 'number' ? volume : 1;
    try {
      switch (name) {
        case 'jump': tone(a, 'square', 280, 620, 0.16, 0.18 * v); break;
        case 'coin': tone(a, 'square', 988, 0, 0.08, 0.15 * v); tone(a, 'square', 1319, 0, 0.22, 0.15 * v, 0.08); break;
        case 'hit': tone(a, 'sawtooth', 220, 60, 0.2, 0.25 * v); noise(a, 0.12, 0.2 * v, 1200); break;
        case 'explosion': noise(a, 0.7, 0.5 * v, 900); tone(a, 'sine', 120, 30, 0.6, 0.4 * v); break;
        case 'shoot': tone(a, 'square', 880, 110, 0.14, 0.12 * v); break;
        case 'powerup': [523, 659, 784, 1047].forEach(function (f, i) { tone(a, 'triangle', f, 0, 0.12, 0.18 * v, i * 0.07); }); break;
        case 'click': tone(a, 'sine', 660, 0, 0.05, 0.15 * v); break;
        case 'win': [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(a, 'triangle', f, 0, 0.25, 0.2 * v, i * 0.11); }); break;
        case 'lose': [392, 330, 262, 196].forEach(function (f, i) { tone(a, 'sawtooth', f, 0, 0.28, 0.14 * v, i * 0.16); }); break;
        case 'step': noise(a, 0.05, 0.12 * v, 600); break;
        default: tone(a, 'sine', 440, 0, 0.1, 0.12 * v);
      }
    } catch (e) {}
  };

  P.share = function (text) {
    text = String(text || '');
    if (embedded) { post({ type: 'share', text: text }); return; }
    try {
      if (navigator.share) { navigator.share({ text: text }).catch(function () {}); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(text);
    } catch (e) {}
  };

  function rid(n) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var s = '';
    for (var i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }
  var playerId = rid(10);

  function Room(code, name) {
    this.code = code;
    this.playerId = playerId;
    this.name = name;
    this.players = [];
    this.isHost = false;
    this.hostId = null;
    this.inviteUrl = C.playUrl ? C.playUrl + (C.playUrl.indexOf('?') < 0 ? '?' : '&') + 'room=' + code : '';
    this._h = {};
    this._send = function () {};
    this._close = function () {};
  }
  Room.prototype.on = function (ev, cb) { (this._h[ev] = this._h[ev] || []).push(cb); return this; };
  Room.prototype.off = function (ev, cb) { this._h[ev] = (this._h[ev] || []).filter(function (x) { return x !== cb; }); return this; };
  Room.prototype._emit = function (ev, arg) {
    (this._h[ev] || []).slice().forEach(function (cb) {
      try { cb(arg); } catch (e) { report('error', 'Error in room "' + ev + '" handler: ' + (e && e.message), 0, 0, e && e.stack); }
    });
  };
  Room.prototype._setPlayers = function (list) {
    list.sort(function (a, b) { return (a.joinedAt - b.joinedAt) || (a.id < b.id ? -1 : 1); });
    var before = {};
    this.players.forEach(function (p) { before[p.id] = p; });
    var now = {};
    list.forEach(function (p) { now[p.id] = p; });
    this.players = list;
    this.hostId = list.length ? list[0].id : null;
    this.isHost = this.hostId === playerId;
    var self = this;
    list.forEach(function (p) { if (!before[p.id] && p.id !== playerId) self._emit('join', p); });
    Object.keys(before).forEach(function (id) { if (!now[id]) self._emit('leave', before[id]); });
    this._emit('players', list.slice());
  };
  Room.prototype.send = function (type, data) {
    if (typeof type !== 'string') { data = type; type = 'message'; }
    this._send({ from: playerId, type: type, data: data === undefined ? null : data });
  };
  Room.prototype.leave = function () { this._close(); this.players = []; };

  var sbPromise = null;
  function loadSupabase() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    if (sbPromise) return sbPromise;
    sbPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = C.supabaseJs;
      s.onload = function () { resolve(window.supabase); };
      s.onerror = function () { sbPromise = null; reject(new Error('Could not load the multiplayer library')); };
      document.head.appendChild(s);
    });
    return sbPromise;
  }
  var sbClient = null;

  function joinSupabase(room, opts) {
    return loadSupabase().then(function (lib) {
      if (!sbClient) {
        sbClient = lib.createClient(C.supabaseUrl, C.supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, lock: function (n, t, fn) { return fn(); } },
          realtime: { params: { eventsPerSecond: 40 } }
        });
      }
      return new Promise(function (resolve, reject) {
        var settled = false;
        var ch = sbClient.channel('prefly:' + P.gameId + ':' + room.code, { config: { broadcast: { self: false }, presence: { key: playerId } } });
        function readPresence() {
          var st = ch.presenceState();
          return Object.keys(st).map(function (key) {
            var meta = st[key][0] || {};
            return { id: key, name: meta.name || 'Player', joinedAt: meta.joinedAt || 0 };
          });
        }
        ch.on('broadcast', { event: 'm' }, function (msg) { room._emit('message', msg.payload); });
        ch.on('presence', { event: 'sync' }, function () {
          var list = readPresence();
          if (!settled) {
            if (!list.some(function (p) { return p.id === playerId; })) return;
            settled = true;
            list.sort(function (a, b) { return (a.joinedAt - b.joinedAt) || (a.id < b.id ? -1 : 1); });
            var index = list.map(function (p) { return p.id; }).indexOf(playerId);
            if (opts.maxPlayers && index >= opts.maxPlayers) {
              ch.untrack(); sbClient.removeChannel(ch);
              reject(new Error('Room is full'));
              return;
            }
            room._setPlayers(list);
            resolve(room);
            return;
          }
          room._setPlayers(list);
        });
        room._send = function (payload) { ch.send({ type: 'broadcast', event: 'm', payload: payload }); };
        room._close = function () { try { ch.untrack(); sbClient.removeChannel(ch); } catch (e) {} };
        ch.subscribe(function (status) {
          if (status === 'SUBSCRIBED') {
            ch.track({ name: room.name, joinedAt: Date.now() });
          } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
            settled = true;
            reject(new Error('Could not connect to the room'));
          }
        });
        setTimeout(function () { if (!settled) { settled = true; room._close(); reject(new Error('Connection timed out')); } }, 15000);
      });
    });
  }

  function joinLocal(room, opts) {
    return new Promise(function (resolve, reject) {
      if (typeof BroadcastChannel !== 'function') { reject(new Error('Multiplayer is not available here')); return; }
      var bc = new BroadcastChannel('prefly:' + P.gameId + ':' + room.code);
      var me = { id: playerId, name: room.name, joinedAt: Date.now() };
      var peers = {};
      peers[playerId] = { p: me, seen: Infinity };
      function sync() { room._setPlayers(Object.keys(peers).map(function (k) { return peers[k].p; })); }
      bc.onmessage = function (ev) {
        var m = ev.data || {};
        if (m.kind === 'hello') {
          var isNew = !peers[m.p.id];
          peers[m.p.id] = { p: m.p, seen: Date.now() };
          if (m.reply) bc.postMessage({ kind: 'hello', p: me });
          if (isNew) sync();
        } else if (m.kind === 'bye') {
          delete peers[m.id]; sync();
        } else if (m.kind === 'msg') {
          room._emit('message', m.payload);
        }
      };
      var timer = setInterval(function () {
        bc.postMessage({ kind: 'hello', p: me });
        var now = Date.now();
        var changed = false;
        Object.keys(peers).forEach(function (k) { if (now - peers[k].seen > 6000) { delete peers[k]; changed = true; } });
        if (changed) sync();
      }, 2000);
      room._send = function (payload) { bc.postMessage({ kind: 'msg', payload: payload }); };
      room._close = function () { clearInterval(timer); bc.postMessage({ kind: 'bye', id: playerId }); bc.close(); };
      bc.postMessage({ kind: 'hello', p: me, reply: true });
      setTimeout(function () {
        var count = Object.keys(peers).length;
        if (opts.maxPlayers && count > opts.maxPlayers) { room._close(); reject(new Error('Room is full')); return; }
        sync();
        resolve(room);
      }, 400);
    });
  }

  function joinRoom(code, opts) {
    opts = opts || {};
    code = String(code || '').trim().toUpperCase();
    if (!code) return Promise.reject(new Error('Enter a room code'));
    var room = new Room(code, String(opts.name || 'Player').slice(0, 24));
    if (C.supabaseUrl && C.supabaseKey && C.supabaseJs) return joinSupabase(room, opts);
    return joinLocal(room, opts);
  }

  P.multiplayer = {
    playerId: playerId,
    defaultRoom: C.room ? String(C.room).toUpperCase() : null,
    online: Boolean(C.supabaseUrl && C.supabaseKey),
    joinRoom: joinRoom,
    createRoom: function (opts) { return joinRoom(rid(5), opts); }
  };

  if (C.test) {
    try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (e) {}
    var keys = [['Enter', 'Enter', 13], [' ', 'Space', 32], ['ArrowRight', 'ArrowRight', 39], ['ArrowUp', 'ArrowUp', 38], ['ArrowLeft', 'ArrowLeft', 37], ['d', 'KeyD', 68], ['w', 'KeyW', 87], ['ArrowDown', 'ArrowDown', 40], [' ', 'Space', 32], ['a', 'KeyA', 65]];
    function key(type, k) {
      var target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document;
      var ev = new KeyboardEvent(type, { key: k[0], code: k[1], bubbles: true, cancelable: true });
      try { Object.defineProperty(ev, 'keyCode', { get: function () { return k[2]; } }); Object.defineProperty(ev, 'which', { get: function () { return k[2]; } }); } catch (e) {}
      target.dispatchEvent(ev);
    }
    function tap(x, y) {
      var t = document.elementFromPoint(x, y) || document.body;
      var init = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 };
      var PE = window.PointerEvent || MouseEvent;
      t.dispatchEvent(new PE('pointerdown', init));
      t.dispatchEvent(new MouseEvent('mousedown', init));
      init.buttons = 0;
      t.dispatchEvent(new PE('pointerup', init));
      t.dispatchEvent(new MouseEvent('mouseup', init));
      t.dispatchEvent(new MouseEvent('click', init));
    }
    function startInputs() {
      setTimeout(function () {
        tap(window.innerWidth / 2, window.innerHeight / 2);
        var i = 0;
        var iv = setInterval(function () {
          var k = keys[i % keys.length];
          key('keydown', k);
          setTimeout(function () { key('keyup', k); }, 120);
          if (i === 4) tap(window.innerWidth * 0.5, window.innerHeight * 0.6);
          i++;
          if (i >= 14) clearInterval(iv);
        }, 180);
      }, 900);
      setTimeout(function () { post({ type: 'test-complete', errors: errorCount }); }, C.testDuration || 5000);
    }
    if (document.readyState === 'complete') startInputs(); else window.addEventListener('load', startInputs);
  }

  post({ type: 'boot' });
})();
`;
