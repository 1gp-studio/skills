#!/usr/bin/env node
// Record a store-page preview video and screenshots of a web game, or screenshot one page (a cover).
// Needs only Node 22+ and an installed Chrome or Edge: no npm packages, no Playwright, no ffmpeg.
//
//   node record.mjs <gameDir> --director trailer.js --size 1080x1920 --video out/preview.webm --shots out/shots
//   node record.mjs --url http://localhost:5173/ --director trailer.js --size 1920x1080 --video out/preview.webm
//   node record.mjs still cover.html --size 1600x900 --out out/cover.png
// Options: --lang zh-CN|en-US (the browser language the game sees), --touch (touch input instead of mouse),
//   --fps 30, --seed 7 (or off), --bitrate 6000000, --scale (device pixels per CSS px), --isolate (COOP/COEP,
//   for Godot threads), --no-gpu, --settle 1.5 (seconds to let the page load), --frames dir (a JPEG every 0.5 s to review).
//
// How it works: the game page loads in headless Chrome with its clock replaced (performance.now, Date.now,
// requestAnimationFrame, setTimeout/setInterval). Until the director starts, time runs normally so the game
// can load. Then the director script steps time one video frame at a time, so the video is a smooth 30 fps
// however slow the machine is. Each frame is screenshotted (DOM, canvas and WebGL alike), encoded to VP9 by
// the browser's own WebCodecs, and written as WebM. Math.random is seeded, so a good take can be re-recorded.
//
// The director is the body of an async function that receives REC (see references/director.md):
//   await REC.wait(sec, t => {...})  step the game sec seconds (recording frames while REC.start()ed)
//   await REC.skip(sec)              step without painting or recording (fast-forward)
//   REC.start() / REC.stop()         start/stop adding frames to the video
//   await REC.shot('01-start')       save a PNG screenshot into --shots
//   await REC.tap(x, y) / REC.down / REC.move / REC.up / REC.key('ArrowLeft', holdSec)   real input, CSS px
//   REC.caption('挑战海怪', { y: .12, size: .075 })   big outlined caption; REC.caption('') clears it
//   REC.log(...), REC.width, REC.height, REC.fps
// With --hook TEXT the director is pasted into the entry HTML right before the last occurrence of TEXT, so
// it runs inside the game's own closure and can call its functions (newRun(), go('title') ...). Without
// --hook it runs in page scope and sees the page's globals (top-level let/const of classic scripts too).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';

// ------------------------------------------------------------------ arguments
const argv = process.argv.slice(2);
const still = argv[0] === 'still';
if (still) argv.shift();
const opt = (name, fallback) => { const i = argv.indexOf('--' + name); if (i < 0) return fallback; const [v] = argv.splice(i, 2).slice(1); return v; };
const flag = name => { const i = argv.indexOf('--' + name); if (i < 0) return false; argv.splice(i, 1); return true; };
const size = (opt('size', still ? '1600x900' : '1080x1920')).split('x').map(Number);
const out = opt('out'), video = opt('video'), shotsDir = opt('shots'), framesDir = opt('frames');
const directorFile = opt('director'), hook = opt('hook'), entry = opt('entry', 'index.html'), pageUrl = opt('url');
const fps = +opt('fps', 30), seed = opt('seed', '7'), bitrate = +opt('bitrate', 6e6), timeout = +opt('timeout', 900);
const lang = opt('lang'), touch = flag('touch'), isolate = flag('isolate'), noGpu = flag('no-gpu'), settle = +opt('settle', 1.5);
const scale = +opt('scale', size[0] < size[1] ? 3 : size[0] >= 1600 ? 1.5 : 1);
const target = argv[0];
const usage = 'usage: node record.mjs <gameDir> --director file.js --size WxH [--video f.webm] [--shots dir]\n       node record.mjs still <page.html|url> --size WxH --out f.png';
if (!pageUrl && !target) fail(usage);
if (!still && !directorFile) fail('--director is required\n' + usage);
if (still && !out) fail('--out is required\n' + usage);
if (typeof WebSocket !== 'function') fail('Node 22 or newer is needed (built-in WebSocket).');
const css = [Math.round(size[0] / scale), Math.round(size[1] / scale)];

function fail(message) { console.error(message); process.exit(1); }
const log = (...a) => console.log('[record]', ...a);

// ------------------------------------------------------------------ browser
function findBrowser() {
  const env = process.env.CHROME_PATH; if (env && existsSync(env)) return env;
  const local = process.env.LOCALAPPDATA || '', pf = process.env.PROGRAMFILES || 'C:\\Program Files', pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const candidates = [
    join(pf, 'Google/Chrome/Application/chrome.exe'), join(pf86, 'Google/Chrome/Application/chrome.exe'), join(local, 'Google/Chrome/Application/chrome.exe'),
    join(pf86, 'Microsoft/Edge/Application/msedge.exe'), join(pf, 'Microsoft/Edge/Application/msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  ];
  const found = candidates.find(path => existsSync(path));
  if (!found) fail('No Chrome or Edge found. Install Chrome, or set CHROME_PATH to its executable.');
  return found;
}

// ------------------------------------------------------------------ local server
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.pck': 'application/octet-stream', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const stillFile = still && !/^https?:/.test(target) ? resolve(target) : null;
const root = stillFile ? dirname(stillFile) : target && !pageUrl ? resolve(target) : null;
const director = directorFile ? readFileSync(resolve(directorFile), 'utf8') : '';
const directorDefinition = `window.__recDirector = async (REC) => {\n${director}\n};\n`;

function serve() {
  return new Promise(done => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const headers = { 'Cache-Control': 'no-store', ...(isolate && { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }) };
      if (path === '/__rec/encoder.html') { res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }); return res.end(ENCODER_PAGE); }
      if (!root) { res.writeHead(404); return res.end(); }
      let file = resolve(root, '.' + path);
      if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) { res.writeHead(404); return res.end(); }
      let body = readFileSync(file);
      if (hook && file === resolve(root, entry)) {
        const html = body.toString('utf8'), at = html.lastIndexOf(hook);
        if (at < 0) { console.error(`[record] --hook text not found in ${entry}`); res.writeHead(500); return res.end(); }
        body = Buffer.from(html.slice(0, at) + '\n;' + directorDefinition + html.slice(at));
      }
      res.writeHead(200, { ...headers, 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => done(server));
  });
}

// ------------------------------------------------------------------ Chrome DevTools Protocol
async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'record-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--mute-audio', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', `--window-size=${css[0]},${css[1]}`,
    ...(lang ? [`--lang=${lang}`] : []), '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ...(noGpu ? [] : ['--enable-gpu', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]), 'about:blank'];
  const child = spawn(findBrowser(), args, { stdio: 'ignore' });
  const file = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 200 && !existsSync(file); i++) await new Promise(r => setTimeout(r, 100));
  if (!existsSync(file)) fail('The browser did not start.');
  let text = ''; for (let i = 0; i < 50 && text.split('\n').length < 2; i++) { text = readFileSync(file, 'utf8'); await new Promise(r => setTimeout(r, 50)); }
  const [port, path] = text.trim().split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let id = 0; const waiting = new Map(), listeners = [];
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && waiting.has(msg.id)) { const { ok, no } = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? no(new Error(msg.error.message)) : ok(msg.result); }
    else for (const listen of listeners) listen(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const n = ++id; waiting.set(n, { ok, no }); ws.send(JSON.stringify({ id: n, method, params, sessionId })); });
  async function page(url) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => send(method, params, sessionId);
    const on = (method, fn) => listeners.push(msg => msg.sessionId === sessionId && msg.method === method && fn(msg.params));
    return { s, on, url };
  }
  const close = () => { try { ws.close(); } catch {} child.kill(); setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 500); };
  return { page, close };
}

const evaluate = async (s, expression, awaitPromise = true) => {
  const r = await s('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
async function open(p, url, metrics) {
  await p.s('Page.enable'); await p.s('Runtime.enable');
  await p.s('Emulation.setDeviceMetricsOverride', metrics);
  if (lang) { await p.s('Emulation.setLocaleOverride', { locale: lang }).catch(() => {}); await p.s('Network.setExtraHTTPHeaders', { headers: { 'Accept-Language': lang } }).catch(() => {}); }
  if (touch) await p.s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const loaded = new Promise(r => p.on('Page.loadEventFired', r));
  await p.s('Page.navigate', { url });
  await Promise.race([loaded, new Promise(r => setTimeout(r, 30000))]);
  await evaluate(p.s, 'document.fonts ? document.fonts.ready.then(() => true) : true');
  await new Promise(r => setTimeout(r, settle * 1000));
}

// ------------------------------------------------------------------ page clock + REC (runs before the game)
const SHIM = (seedValue, fpsValue, touchInput) => `(() => {
  if (window.__REC) return;
  ${seedValue === 'off' ? '' : `let s = ${Number(seedValue) | 0} || 7;
  Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };`}
  const R = { raf: requestAnimationFrame.bind(window), caf: cancelAnimationFrame.bind(window), now: performance.now.bind(performance), dnow: Date.now,
    st: setTimeout.bind(window), ct: clearTimeout.bind(window), si: setInterval.bind(window), ci: clearInterval.bind(window) };
  let virtual = false, vnow = 0, dateBase = 0, nextId = 1e9;
  const rafs = new Map(), timers = new Map();
  performance.now = () => virtual ? vnow : R.now();
  Date.now = () => virtual ? Math.round(dateBase + vnow) : R.dnow();
  window.requestAnimationFrame = cb => { if (!virtual) return R.raf(cb); rafs.set(++nextId, cb); return nextId; };
  window.cancelAnimationFrame = id => rafs.has(id) ? rafs.delete(id) : R.caf(id);
  const timer = every => (fn, ms = 0, ...a) => {
    if (!virtual) return (every ? R.si : R.st)(fn, ms, ...a);
    const wait = Math.max(every ? 1 : 0, +ms || 0); timers.set(++nextId, { due: vnow + wait, every: every ? wait : 0, fn, a }); return nextId;
  };
  window.setTimeout = timer(false); window.setInterval = timer(true);
  window.clearTimeout = id => timers.has(id) ? timers.delete(id) : R.ct(id);
  window.clearInterval = id => timers.has(id) ? timers.delete(id) : R.ci(id);
  function step(ms) {
    const end = vnow + ms;
    for (let guard = 0; guard < 10000; guard++) {
      let id = null, t = null;
      for (const [k, v] of timers) if (v.due <= end && (!t || v.due < t.due)) { id = k; t = v; }
      if (!t) break;
      vnow = Math.max(vnow, t.due);
      if (t.every) t.due += t.every; else timers.delete(id);
      try { if (typeof t.fn === 'function') t.fn(...t.a); } catch (e) { console.error(e); }
    }
    vnow = end;
    const list = [...rafs.values()]; rafs.clear();
    for (const cb of list) try { cb(vnow); } catch (e) { console.error(e); }
  }
  const paint = () => new Promise(r => R.raf(() => R.raf(r)));
  let callId = 0; const pending = new Map();
  const call = (op, data = {}) => new Promise((ok, no) => { const id = ++callId; pending.set(id, { ok, no }); window.__recCall(JSON.stringify({ id, op, ...data })); });
  window.__recResolve = (id, value, error) => { const p = pending.get(id); pending.delete(id); if (p) error ? p.no(new Error(error)) : p.ok(value); };
  let cap = null;
  const REC = {
    fps: ${fpsValue}, recording: false,
    get width() { return innerWidth; }, get height() { return innerHeight; }, get time() { return vnow; },
    start() { this.recording = true; }, stop() { this.recording = false; },
    async wait(sec, each) {
      const n = Math.max(1, Math.round(sec * this.fps));
      for (let i = 0; i < n; i++) {
        if (each) await each(i / this.fps);
        step(1000 / this.fps); await paint();
        if (this.recording) await call('frame');
      }
    },
    async skip(sec) { const n = Math.round(sec * this.fps); for (let i = 0; i < n; i++) step(1000 / this.fps); await paint(); },
    // Screenshots are of the game itself: the video caption is hidden while one is taken.
    async shot(name) { const shown = cap && !cap.hidden; if (shown) cap.hidden = true; await paint(); try { return await call('shot', { name: String(name) }); } finally { if (shown) cap.hidden = false; } },
    tap(x, y) { return call('input', { kind: 'tap', x, y }); },
    down(x, y) { return call('input', { kind: 'down', x, y }); },
    move(x, y) { return call('input', { kind: 'move', x, y }); },
    up(x, y) { return call('input', { kind: 'up', x, y }); },
    async key(key, hold = 0) { await call('input', { kind: 'keydown', key }); if (hold) await this.wait(hold); return call('input', { kind: 'keyup', key }); },
    caption(text, o = {}) {
      if (!cap) { cap = document.createElement('div'); document.documentElement.appendChild(cap); }
      const px = Math.round(Math.min(innerWidth, innerHeight * 1.2) * (o.size || .075));
      cap.style.cssText = 'position:fixed;left:0;right:0;z-index:2147483647;pointer-events:none;text-align:center;white-space:pre-line;line-height:1.15;'
        + 'top:' + ((o.y ?? .1) * 100) + '%;font:' + (o.weight || 900) + ' ' + px + 'px ' + (o.font || 'system-ui,"PingFang SC","Microsoft YaHei",sans-serif') + ';'
        + 'color:' + (o.color || '#fff') + ';-webkit-text-stroke:' + Math.max(2, px / 9) + 'px ' + (o.stroke || '#1b1b2f') + ';paint-order:stroke fill;'
        + 'text-shadow:0 ' + Math.max(2, px / 14) + 'px 0 ' + (o.stroke || '#1b1b2f') + ';';
      cap.textContent = text || ''; cap.hidden = !text;
    },
    log(...a) { return call('log', { text: a.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' ') }); },
  };
  window.__REC = REC;
  window.__recGo = async () => {
    vnow = R.now(); dateBase = R.dnow() - vnow; virtual = true;
    await paint(); await paint();
    try { await window.__recDirector(REC); await call('done'); } catch (e) { await call('error', { text: String(e && e.stack || e) }); }
  };
})();`;

// ------------------------------------------------------------------ encoder page (WebCodecs → chunks)
const ENCODER_PAGE = `<!doctype html><meta charset="utf-8"><script>
let enc, chunks = [], failure = null, w, h, fps;
async function setup(width, height, rate, bitrate) {
  w = width; h = height; fps = rate;
  for (const codec of ['vp09.00.40.08', 'vp09.00.10.08', 'vp8']) {
    const config = { codec, width, height, bitrate, framerate: rate, latencyMode: 'quality' };
    if ((await VideoEncoder.isConfigSupported(config)).supported) {
      enc = new VideoEncoder({ output: c => { const b = new Uint8Array(c.byteLength); c.copyTo(b); chunks.push({ t: c.timestamp, key: c.type === 'key', b }); }, error: e => failure = String(e) });
      enc.configure(config); return codec;
    }
  }
  throw new Error('No VP9/VP8 encoder in this browser');
}
async function add(b64, i) {
  if (failure) throw new Error(failure);
  const bmp = await createImageBitmap(await (await fetch('data:image/jpeg;base64,' + b64)).blob());
  const frame = new VideoFrame(bmp, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
  enc.encode(frame, { keyFrame: i % (fps * 2) === 0 }); frame.close(); bmp.close();
  while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 5));
  return true;
}
async function finish() { await enc.flush(); if (failure) throw new Error(failure); return chunks.length; }
function take(from, n) {
  const part = chunks.slice(from, from + n).map(c => { let s = ''; for (let i = 0; i < c.b.length; i += 32768) s += String.fromCharCode.apply(null, c.b.subarray(i, i + 32768)); return { t: c.t, key: c.key, d: btoa(s) }; });
  return part;
}
</script>`;

// ------------------------------------------------------------------ WebM writer
function ebml(id, ...parts) {
  const body = Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));
  const size = Buffer.alloc(8); size[0] = 0x01; size.writeUIntBE(Math.floor(body.length / 2 ** 32), 1, 3); size.writeUInt32BE(body.length >>> 0, 4);
  return Buffer.concat([Buffer.from(id.toString(16).padStart(id > 0xffffff ? 8 : id > 0xffff ? 6 : id > 0xff ? 4 : 2, '0'), 'hex'), size, body]);
}
const uint = (id, value) => { let hex = value.toString(16); if (hex.length % 2) hex = '0' + hex; return ebml(id, Buffer.from(hex, 'hex')); };
const str = (id, value) => ebml(id, Buffer.from(value, 'utf8'));
const float = (id, value) => { const b = Buffer.alloc(8); b.writeDoubleBE(value); return ebml(id, b); };
function webm(chunks, width, height, codec, frameRate) {
  const header = ebml(0x1A45DFA3, uint(0x4286, 1), uint(0x42F7, 1), uint(0x42F2, 4), uint(0x42F3, 8), str(0x4282, 'webm'), uint(0x4287, 2), uint(0x4285, 2));
  const durationMs = chunks.length ? chunks.at(-1).t / 1000 + 1000 / frameRate : 0;
  const info = ebml(0x1549A966, uint(0x2AD7B1, 1000000), str(0x4D80, '1gp-store-kit'), str(0x5741, '1gp-store-kit'), float(0x4489, durationMs));
  const tracks = ebml(0x1654AE6B, ebml(0xAE, uint(0xD7, 1), uint(0x73C5, 1), uint(0x83, 1), str(0x86, codec.startsWith('vp09') ? 'V_VP9' : 'V_VP8'),
    uint(0x23E383, Math.round(1e9 / frameRate)), ebml(0xE0, uint(0xB0, width), uint(0xBA, height))));
  const clusters = []; let current = null, start = 0;
  for (const c of chunks) {
    const ms = Math.round(c.t / 1000);
    if (!current || c.key || ms - start > 30000) { if (current) clusters.push(ebml(0x1F43B675, uint(0xE7, start), ...current)); current = []; start = ms; }
    const head = Buffer.alloc(4); head[0] = 0x81; head.writeInt16BE(ms - start, 1); head[3] = c.key ? 0x80 : 0;
    current.push(ebml(0xA3, head, c.data));
  }
  if (current) clusters.push(ebml(0x1F43B675, uint(0xE7, start), ...current));
  return Buffer.concat([header, ebml(0x18538067, info, tracks, ...clusters)]);
}

// ------------------------------------------------------------------ input
const KEYS = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, ' ': 32, Space: 32, Enter: 13, Escape: 27, Shift: 16, Control: 17, Tab: 9, Backspace: 8 };
async function input(s, { kind, x, y, key }) {
  if (kind === 'keydown' || kind === 'keyup') {
    const k = key === 'Space' ? ' ' : key, code = KEYS[k] ?? k.toUpperCase().charCodeAt(0);
    const codeName = k === ' ' ? 'Space' : k.length === 1 ? (/[a-z]/i.test(k) ? 'Key' + k.toUpperCase() : /\d/.test(k) ? 'Digit' + k : k) : k;
    return s('Input.dispatchKeyEvent', { type: kind === 'keydown' ? 'keyDown' : 'keyUp', key: k, code: codeName, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, ...(kind === 'keydown' && k.length === 1 && { text: k }) });
  }
  if (touch) {
    const type = { tap: null, down: 'touchStart', move: 'touchMove', up: 'touchEnd' }[kind];
    if (!type) { await input(s, { kind: 'down', x, y }); return input(s, { kind: 'up', x, y }); }
    return s('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  }
  if (kind === 'tap') { await input(s, { kind: 'down', x, y }); return input(s, { kind: 'up', x, y }); }
  const type = { down: 'mousePressed', move: 'mouseMoved', up: 'mouseReleased' }[kind];
  return s('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: kind === 'up' ? 0 : 1, clickCount: kind === 'move' ? 0 : 1, pointerType: 'mouse' });
}

// ------------------------------------------------------------------ main
const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await launch();
const killer = setTimeout(() => { console.error(`[record] gave up after ${timeout} s`); browser.close(); process.exit(1); }, timeout * 1000);
const finishAll = code => { clearTimeout(killer); browser.close(); server.close(); process.exit(code); };
const metrics = { width: css[0], height: css[1], deviceScaleFactor: scale, mobile: css[0] < css[1] };

try {
  if (still) {
    const p = await browser.page();
    await open(p, stillFile ? `${origin}/${encodeURIComponent(stillFile.slice(root.length + 1).split(sep).join('/')).replace(/%2F/g, '/')}` : target, metrics);
    const { data } = await p.s('Page.captureScreenshot', { format: 'png' });
    mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(resolve(out), Buffer.from(data, 'base64'));
    log(`saved ${out} (${size[0]}x${size[1]})`); finishAll(0);
  }

  const game = await browser.page(), encoder = video ? await browser.page() : null;
  let codec = '';
  if (encoder) {
    await encoder.s('Runtime.enable'); await encoder.s('Page.enable');
    const loaded = new Promise(r => encoder.on('Page.loadEventFired', r));
    await encoder.s('Page.navigate', { url: `${origin}/__rec/encoder.html` }); await loaded;
    codec = await evaluate(encoder.s, `setup(${size[0]}, ${size[1]}, ${fps}, ${bitrate})`);
  }
  await game.s('Runtime.enable');
  await game.s('Page.addScriptToEvaluateOnNewDocument', { source: SHIM(seed, fps, touch) });
  await game.s('Runtime.addBinding', { name: '__recCall' });
  game.on('Runtime.consoleAPICalled', e => { if (e.type === 'error' || e.type === 'warning') log('page', e.type + ':', e.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 400)); });
  game.on('Runtime.exceptionThrown', e => log('page error:', (e.exceptionDetails.exception?.description || e.exceptionDetails.text).slice(0, 600)));

  let frames = 0, shots = 0;
  const finished = new Promise((done, broke) => game.on('Runtime.bindingCalled', async ({ name, payload }) => {
    if (name !== '__recCall') return;
    const msg = JSON.parse(payload); let value = null, error = null;
    try {
      if (msg.op === 'frame') {
        const { data } = await game.s('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
        if (encoder) await evaluate(encoder.s, `add(${JSON.stringify(data)}, ${frames})`);
        if (framesDir && frames % Math.max(1, Math.round(fps / 2)) === 0) { mkdirSync(framesDir, { recursive: true }); writeFileSync(join(framesDir, `f${String(frames).padStart(4, '0')}.jpg`), Buffer.from(data, 'base64')); }
        frames++; if (frames % fps === 0) log(`${frames / fps} s recorded`);
      } else if (msg.op === 'shot') {
        if (!shotsDir) throw new Error('REC.shot needs --shots <dir>');
        const { data } = await game.s('Page.captureScreenshot', { format: 'png' });
        mkdirSync(shotsDir, { recursive: true }); const file = join(shotsDir, msg.name.replace(/[^\w.-]+/g, '-') + '.png');
        writeFileSync(file, Buffer.from(data, 'base64')); shots++; value = file; log('shot', file);
      } else if (msg.op === 'input') await input(game.s, msg);
      else if (msg.op === 'log') log(msg.text);
      else if (msg.op === 'done') return done();
      else if (msg.op === 'error') return broke(new Error('director failed: ' + msg.text));
    } catch (e) { error = String(e.message || e); }
    await game.s('Runtime.evaluate', { expression: `__recResolve(${msg.id}, ${JSON.stringify(value)}, ${JSON.stringify(error)})` }).catch(() => {});
  }));

  await open(game, pageUrl || `${origin}/${entry}`, metrics);
  if (!hook) await evaluate(game.s, directorDefinition + 'true');
  if (!await evaluate(game.s, 'typeof window.__recDirector === "function"')) throw new Error('director not defined: check --hook text and that the page loaded');
  log(`page ${css[0]}x${css[1]} css px @${scale}x → ${size[0]}x${size[1]}`);
  game.s('Runtime.evaluate', { expression: '__recGo()' }).catch(() => {});
  await finished;

  if (encoder) {
    if (!frames) throw new Error('no frames recorded: call REC.start() before REC.wait()');
    const count = await evaluate(encoder.s, 'finish()');
    const chunks = [];
    for (let i = 0; i < count; i += 20) for (const c of await evaluate(encoder.s, `take(${i}, 20)`)) chunks.push({ t: c.t, key: c.key, data: Buffer.from(c.d, 'base64') });
    const file = webm(chunks, size[0], size[1], codec, fps);
    mkdirSync(dirname(resolve(video)), { recursive: true }); writeFileSync(resolve(video), file);
    log(`saved ${video}: ${(frames / fps).toFixed(1)} s, ${size[0]}x${size[1]}, ${codec}, ${(file.length / 1048576).toFixed(1)} MB`);
    if (file.length > 20 * 1048576) log('WARNING: over the 20 MB limit; record shorter or lower --bitrate');
  }
  if (shotsDir) log(`${shots} screenshots in ${shotsDir}`);
  finishAll(0);
} catch (e) {
  console.error('[record]', e.message || e); finishAll(1);
}
