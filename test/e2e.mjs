// Chrome の実際のマイク入力経路を偽デバイスと CDP で検証する。依存パッケージ不要。
import {spawn} from 'node:child_process';
import {deepEqual, equal, ok} from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as scales from '../scales.mjs';
import {DIFFICULTIES, centsBetween, detectedName} from '../intonation.mjs';
import {MIC_LEVELS, PitchDetector} from '../engine.mjs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createServer} from 'node:net';
import {buildScale, targetFor} from '../scales.mjs';

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const root = resolve(import.meta.dirname, '..');
const temp = await mkdtemp(join(tmpdir(), 'viola-e2e-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const n = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return n;
}
async function waitFor(fn, timeout = 12000) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await sleep(80);
  }
  throw new Error(`待機がタイムアウト: ${last instanceof Error ? last.message : JSON.stringify(last)}`);
}
function wav(frequency, kind) {
  const rate = 44100, seconds = kind === 'echo' ? 7 : 12;
  const samples = rate * seconds, out = Buffer.alloc(44 + samples * 2);
  out.write('RIFF', 0); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(samples * 2, 40);
  let seed = 123456789;
  for (let i = 0; i < samples; i++) {
    const t = i / rate, active = kind === 'echo' ? t < 2.4 : t >= 3.05;
    const phase = 2 * Math.PI * frequency * t;
    // 固定シードで、毎回同じ白色雑音を実際のマイク経路に渡す。
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const signal = kind === 'noise'
      ? .02 * Math.sin(2 * Math.PI * 100 * t) + .02 * Math.sin(2 * Math.PI * 150 * t) + .01 * (2 * seed / 2 ** 32 - 1)
      : !active ? 0 : kind === 'harmonics'
        // 3倍音の位相を反転し、指定振幅のまま16bitの範囲に収める。
        ? .05 * Math.sin(phase) + .5 * Math.sin(phase * 2) - .4 * Math.sin(phase * 3) + .2 * Math.sin(phase * 4)
        : .30 * (Math.sin(phase) + .35 * Math.sin(phase * 2) + .16 * Math.sin(phase * 3));
    out.writeInt16LE(Math.round(signal * 32767), 44 + 2 * i);
  }
  return out;
}
class CDP {
  constructor(ws) { this.ws = ws; this.serial = 0; this.pending = new Map(); this.exceptions = []; ws.onmessage = e => {
    const msg = JSON.parse(e.data), pending = this.pending.get(msg.id);
    if (msg.method === 'Runtime.exceptionThrown') this.exceptions.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.error) pending.reject(new Error(msg.error.message)); else pending.resolve(msg.result);
  }; }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    return new CDP(ws);
  }
  call(method, params = {}) {
    const id = ++this.serial;
    return new Promise((resolve, reject) => { this.pending.set(id, {resolve, reject}); this.ws.send(JSON.stringify({id, method, params})); });
  }
  async evaluate(expression) {
    const r = await this.call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  close() { this.ws.close(); }
}

async function checkTempo(cdp) {
  await cdp.evaluate(`(() => {
    const wake = window.wake = {requests: [], releases: 0};
    Object.defineProperty(navigator, 'wakeLock', {value: {
      async request(type) {
        wake.requests.push(type);
        const lock = new EventTarget();
        lock.released = false;
        lock.release = async () => {
          if (lock.released) return;
          lock.released = true;
          wake.releases++;
          lock.dispatchEvent(new Event('release'));
        };
        return lock;
      }
    }});
    document.querySelector('[data-mode="tempo"]').click();
    for (const [key, value] of [['tempo', '240'], ['beats', '1']]) {
      const control = document.querySelector('[data-setting="' + key + '"]');
      control.value = value;
      control.dispatchEvent(new Event('change', {bubbles: true}));
    }
    document.querySelector('#start').click();
  })()`);
  await waitFor(() => cdp.evaluate('window.__viola.phase === "countdown"'));
  await cdp.evaluate('window.initialSystems = [...document.querySelectorAll(".score svg")]; void 0');
  const initial = await waitFor(() => cdp.evaluate(`(() => {
    const {tempoSchedule, tempoTransitions} = window.__viola;
    if (!tempoSchedule || !tempoTransitions || tempoTransitions.length < 3) return null;
    const index = window.__viola.index;
    const systems = [...document.querySelectorAll('.score svg')];
    const rings = [...document.querySelectorAll('.score [data-index] > circle')]
      .map(ring => +ring.parentElement.dataset.index);
    document.querySelector('[data-action="pause"]').click();
    return {
      schedule: tempoSchedule, transitions: tempoTransitions.slice(0, 3), index,
      sameSystems: systems.length > 0 && systems.length === initialSystems.length &&
        systems.every((svg, i) => svg === initialSystems[i]),
      rings
    };
  })()`));
  const {schedule, transitions, index} = initial;
  equal(schedule.fromIndex, 0);
  equal(schedule.beat, .25);
  equal(schedule.duration, .25);
  ok(Math.abs(schedule.notesAt - schedule.start - 1) < 1e-6, 'カウントは4拍');
  deepEqual(transitions.map(t => t.index), [0, 1, 2]);
  const errorsMs = transitions.map(t => 1000 * (t.time - (schedule.start + 1 + t.index * .25)));
  ok(errorsMs.every(ms => Math.abs(ms) <= 80), `時刻差が±80msを超えた: ${errorsMs.join(', ')}`);
  ok(initial.sameSystems, '音が変わっても楽譜のSVGは同じ');
  deepEqual(initial.rings, [index], '現在の音だけに輪を表示する');
  await sleep(600);
  deepEqual(await cdp.evaluate('(({phase, index}) => ({phase, index}))(window.__viola)'), {phase: 'paused', index});
  equal(await cdp.evaluate('window.wake.releases'), 1, '一時停止でWake Lockを解放する');
  await cdp.evaluate('document.querySelector(\'[data-action="pause"]\').click()');
  const resumed = await waitFor(() => cdp.evaluate(`(() => {
    const {tempoSchedule, tempoTransitions} = window.__viola;
    return tempoSchedule?.start > ${schedule.start} && tempoTransitions?.length >= 2
      ? {schedule: tempoSchedule, transitions: tempoTransitions.slice(0, 2)} : null;
  })()`));
  equal(resumed.schedule.fromIndex, index);
  equal(resumed.schedule.notesAt, resumed.schedule.start, '再開はカウントを省く');
  deepEqual(resumed.transitions.map(t => t.index), [index, index + 1]);
  await cdp.evaluate('document.querySelector(\'[data-action="back"]\').click()');
  deepEqual(await cdp.evaluate('window.wake'), {requests: ['screen', 'screen'], releases: 2});
  console.log(`場合E 合格 4拍後に0→1→2（時刻差 ${errorsMs.map(ms => ms.toFixed(1)).join(' / ')} ms）、一時停止・再開・楽譜の輪・Wake Lock`);
}

async function checkNatural(cdp, scale) {
  await cdp.evaluate(`(() => {
    document.querySelector('[data-form="natural"]').click();
    document.querySelector('[data-tonic="A"][data-alter="0"]').click();
    document.querySelector('#start').click();
  })()`);
  await waitFor(() => cdp.evaluate('window.__viola.phase === "reference"'));
  await cdp.evaluate(`(() => {
    for (let i = 0; i < 28; i++) document.querySelector('[data-action="next"]').click();
  })()`);
  await waitFor(() => cdp.evaluate('window.__viola.phase === "finished"'));
  const rows = await cdp.evaluate(`Array.from(document.querySelectorAll('tbody tr'),
    row => Array.from(row.cells, cell => cell.textContent))`);
  deepEqual(rows.map(row => row.slice(0, 2)), scale.notes.map(note => [note.name, note.place.short]));
  ok(rows.at(-1)[2].endsWith('¢'), '最後の音に測定値がある');
  equal(rows.at(-1)[3], '合う');
  console.log('場合F 合格 イ自然的短音階の結果に全29音と最後の音の測定値・判定を表示');
}

// 点検と同じく、実際のアプリと検出器に仮想の音声時計・手本の波形を渡す。
// 実時間だけ進む環境でも、遅れて鳴る手本を演奏と判定しないことを確かめる。
async function checkClockGuard() {
  const source = (await readFile(join(root, 'app.mjs'), 'utf8'))
    .replace(/^import .*;\n/gm, '').replace(/\nsetup\(\);\s*$/, '');
  async function trial({delay = 0, freeze = Infinity, suspended = false, stale = false, weakAfterTail = false}) {
    let now = 0, serial = 0, audio;
    const hz = scales.targetFor(scales.buildScale('major', 0, 0).notes[0], {a4: 442, difficulty: 'easy'}).targetHz;
    const tasks = new Map(), detector = new PitchDetector(44100), buffer = new Float32Array(4096);
    const element = {style: {setProperty() {}}, querySelector() {return null;}, querySelectorAll() {return [];}};
    class ClockAudio {
      constructor() {audio = this; this.tones = []; this.master = {gain: {value: .8}};}
      get time() {return Math.max(0, Math.min(now - delay, freeze)) / 1000;}
      get state() {return suspended && now >= freeze ? 'suspended' : 'running';}
      async init() {}
      async ensureRunning() {return this.state === 'running';}
      toneHz(f, d, t) {this.tones.push({f, d, t});}
      stop() {this.tones = [];}
      click() {}
    }
    class EchoMicrophone {
      async start() {return true;}
      stop() {}
      read(level) {
        if (stale) return {rms: .02, frequency: 130.963, confidence: 1};
        buffer.fill(0);
        for (let i = 0; i < buffer.length; i++) {
          const t = audio.time - (buffer.length - i) / 44100;
          const tone = audio.tones.find(o => t > o.t && t < o.t + o.d);
          if (weakAfterTail) {
            // 大きな余韻より小さい演奏でも、解禁600ms後には感度の閾値で拾う。
            buffer[i] = (t < 2.75 ? .02 : .005) * Math.sin(2 * Math.PI * hz * t);
          } else if (tone) buffer[i] = .02 * Math.sin(2 * Math.PI * tone.f * t);
        }
        return detector.detect(buffer, level);
      }
    }
    const sandbox = {
      ...scales, DIFFICULTIES, centsBetween, detectedName, MIC_LEVELS,
      AudioEngine: ClockAudio, Microphone: EchoMicrophone, BRAVURA_LICENSE: '',
      renderScore: () => '', renderOne: () => '', URLSearchParams,
      location: {search: '?test=1'}, localStorage: {getItem() {return '{}';}, setItem() {}},
      navigator: {}, window: {performance: {now: () => now}},
      document: {visibilityState: 'visible', addEventListener() {},
        querySelector(selector) {return selector === '#app' ? {
          clientWidth: 600, addEventListener() {}
        } : element;}, querySelectorAll() {return [];}},
      setTimeout(callback, ms) {tasks.set(++serial, {callback, at: now + ms}); return serial;},
      clearTimeout(id) {tasks.delete(id);}, setInterval() {return 0;}, clearInterval() {},
      requestAnimationFrame(callback) {tasks.set(++serial, {callback, at: now + 16}); return serial;},
      cancelAnimationFrame(id) {tasks.delete(id);}
    };
    vm.createContext(sandbox);
    vm.runInContext(source + `
      performance = () => expose();
      showPhase = () => expose();
      setup = () => {phase = 'setup'; updateScale(); expose();};
      setup();`, sandbox);
    // 開始時の復帰検査とは独立に、予約後に音時計が遅れる経路を検査する。
    vm.runInContext('paused = false; measure(++run);', sandbox);
    const flush = () => new Promise(resolve => setImmediate(resolve));
    await flush();
    const phases = [];
    while (tasks.size) {
      const [id, task] = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
      if (task.at > 8000) break;
      tasks.delete(id); now = task.at; task.callback(); await flush();
      const state = {...sandbox.window.__viola};
      phases.push(state.phase);
      if (weakAfterTail && state.phase === 'measuring') ok(audio.time >= 3.45, '600msより前には弱音の測定を始めない');
      if (weakAfterTail && state.judgement) {
        equal(state.judgement, '合う');
        ok(audio.time >= 3.35, '余韻の閾値を600ms維持してから弱音を測る');
        return phases;
      }
      equal(state.judgement, null, `手本だけなのに判定（実時間 ${now}ms / 音時計 ${audio.time}s）`);
    }
    ok(!weakAfterTail, '余韻より小さい演奏を600ms後にも検出できなかった');
    return phases;
  }
  const delayed = await trial({delay: 2900});
  ok(delayed.includes('listening'), '遅れた手本の終了と余韻を過ぎれば測定待ちになる');
  for (const config of [{freeze: 1350}, {freeze: 1350, suspended: true}, {stale: true}]) {
    const phases = await trial(config);
    ok(!phases.includes('measuring'), '停止時計・停止解析器・同一の読みを測定に数えない');
  }
  await trial({weakAfterTail: true});
  console.log('場合G 合格 音時計2.9秒遅延・停止・suspended・同一の読みで手本だけの判定なし、600ms後の弱音は合格');
}

async function captureShots(cdp) {
  const dir = join(root, 'shots');
  await mkdir(dir, {recursive: true});
  await cdp.call('Page.enable');
  const width = 402, height = 870;
  await cdp.call('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
  await cdp.evaluate(`(() => {
    document.querySelector('[data-action="back"]')?.click();
    document.querySelector('[data-form="harmonic"]').click();
    document.querySelector('[data-tonic="G"][data-alter="1"]').click();
  })()`);
  await cdp.evaluate('document.fonts.ready.then(() => void 0)');
  await cdp.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo(0, 0); requestAnimationFrame(() => resolve());
  })))`);
  const {cssContentSize: content} = await cdp.call('Page.getLayoutMetrics');
  equal(content.width, width, '嬰ト和声的短音階の準備画面に横スクロールがない');
  const {data} = await cdp.call('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, fromSurface: true,
    clip: {x: 0, y: 0, width, height: content.height, scale: 1}
  });
  const path = join(dir, 'gis-harmonic-402-setup.png');
  await writeFile(path, Buffer.from(data, 'base64'));
  console.log(path);
}

const serverPort = await port();
const server = spawn('python3', ['-m', 'http.server', String(serverPort), '--bind', '127.0.0.1', '--directory', root], {stdio: 'ignore'});
const failures = [];
try {
  await waitFor(async () => (await fetch(`http://127.0.0.1:${serverPort}/`)).ok);
  const c = targetFor(buildScale('major', 0, 0).notes[0], {a4: 442, difficulty: 'easy'}).targetHz;
  const d = targetFor(buildScale('major', 1, 0).notes[0], {a4: 442, difficulty: 'easy'}).targetHz;
  const natural = buildScale('natural', 5, 0);
  const a = targetFor(natural.notes.at(-1), {a4: 442, difficulty: 'easy'}).targetHz;
  const cases = process.argv.includes('--shots') ? [{name: '撮影', frequency: c, shots: true}] : [
    {name: 'A', frequency: c, expected: '合う', cents: 0},
    {name: 'B', frequency: c * 2 ** (-20 / 1200), expected: '低い', cents: -20},
    {name: 'C', frequency: c, echo: true},
    {name: 'D', frequency: d, expected: '合う', cents: 0, tonic: 'D'},
    {name: 'E', frequency: c, tempo: true},
    {name: 'F', frequency: a, natural: true},
    {name: 'H', frequency: c, noise: true},
    {name: 'I-C', frequency: c, harmonics: true, expected: '合う', cents: 0, tolerance: 5},
    {name: 'I-D', frequency: d, harmonics: true, expected: '合う', cents: 0, tolerance: 5, tonic: 'D'}
  ];
  if (!process.argv.includes('--shots')) {
    try {await checkClockGuard();} catch (e) {failures.push('G'); console.error(`場合G NG ${e.stack}`);}
  }
  for (const scenario of cases) {
    const path = join(temp, `${scenario.name}.wav`);
    await writeFile(path, wav(scenario.frequency, scenario.echo ? 'echo' : scenario.noise ? 'noise' : scenario.harmonics ? 'harmonics' : 'tone'));
    const debugPort = await port();
    const browser = spawn(chrome, [
      '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${path}`, '--autoplay-policy=no-user-gesture-required',
      `--remote-debugging-port=${debugPort}`, `--user-data-dir=${join(temp, `profile-${scenario.name}`)}`,
      `http://127.0.0.1:${serverPort}/?test=1`
    ], {stdio: ['ignore', 'ignore', 'pipe']});
    let browserLog = ''; browser.stderr.on('data', chunk => { browserLog += chunk; });
    let cdp;
    try {
      const page = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(x => x.type === 'page' && x.webSocketDebuggerUrl));
      cdp = await CDP.connect(page.webSocketDebuggerUrl);
      await cdp.call('Runtime.enable');
      await waitFor(() => cdp.evaluate('document.readyState === "complete" && !!window.__viola && !!document.querySelector("#start")'));
      if (scenario.shots) { await captureShots(cdp); continue; }
      if (scenario.tempo) { await checkTempo(cdp); continue; }
      if (scenario.natural) { await checkNatural(cdp, natural); continue; }
      if (scenario.tonic) await cdp.evaluate(`document.querySelector('[data-tonic="${scenario.tonic}"][data-alter="0"]').click()`);
      await cdp.evaluate('document.querySelector("#start").click()');
      if (scenario.name === 'A') {
        await waitFor(() => cdp.evaluate(`(() => {
          const phase = document.querySelector('#phase');
          return phase?.textContent.includes('お手本（聴く）') &&
            phase.querySelector('.beat')?.textContent.match(/[●○]/g)?.length === 4;
        })()`), 2400);
        await waitFor(() => cdp.evaluate('document.querySelector("#phase")?.textContent.includes("お手本のあとに弾いてください")'), 3200);
        await waitFor(() => cdp.evaluate('document.querySelector("#phase")?.textContent.includes("測っています")'), 2200);
      }
      if (scenario.noise) {
        await waitFor(() => cdp.evaluate('window.__viola.phase === "listening"'));
        const until = Date.now() + 10000;
        // 最後の状態だけでなく、途中の判定・自動進行も検出する。
        while (true) {
          const state = await cdp.evaluate('({...window.__viola})');
          equal(state.judgement, null, `雑音だけで判定が出た: ${JSON.stringify(state)}`);
          equal(state.index, 0, `雑音だけで次へ進んだ: ${JSON.stringify(state)}`);
          ok(state.reading?.rms > .001, '偽マイクから雑音が届いている');
          if (Date.now() >= until) break;
          await sleep(80);
        }
        console.log('場合H 合格 雑音だけで10秒間、判定なし・音の番号0');
      } else if (scenario.echo) {
        await sleep(6000);
        const state = await cdp.evaluate('({...window.__viola})');
        if (state.judgement != null && state.judgement !== '') throw new Error(`判定が出た: ${JSON.stringify(state)}`);
        console.log('場合C 合格 手本だけの入力では判定なし');
      } else {
        let state;
        try { state = await waitFor(async () => {
          const s = await cdp.evaluate('({...window.__viola})');
          return s.judgement != null && s.judgement !== '' ? s : null;
        }, 9500); } catch (e) {
          const debug = await cdp.evaluate('({state:{...window.__viola}, text:document.querySelector("#phase")?.textContent, error:document.querySelector(".error")?.textContent, level:document.querySelector("#level")?.style.width})');
          throw new Error(`${e.message} ${JSON.stringify(debug)} ${cdp.exceptions.join('; ')}`);
        }
        const tolerance = scenario.tolerance ?? 3;
        if (state.judgement !== scenario.expected || !Number.isFinite(state.lastCents) || Math.abs(state.lastCents - scenario.cents) > tolerance) {
          throw new Error(`期待 ${scenario.expected} ${scenario.cents}±${tolerance}¢、実際 ${JSON.stringify(state)}`);
        }
        console.log(`場合${scenario.name} 合格 ${state.judgement} ${state.lastCents.toFixed(1)}¢`);
      }
    } catch (e) {
      failures.push(scenario.name);
      const diagnostics = cdp ? await cdp.evaluate('({...window.__viola, error: document.querySelector(".error")?.textContent})').catch(() => null) : null;
      console.error(`場合${scenario.name} NG ${e.message}${diagnostics ? ` ${JSON.stringify(diagnostics)}` : ''}${cdp?.exceptions.length ? ` ${cdp.exceptions.join('; ')}` : ''}${process.env.E2E_DEBUG ? ` ${browserLog}` : ''}`);
    } finally {
      cdp?.close(); browser.kill('SIGTERM');
      await Promise.race([new Promise(resolve => browser.once('exit', resolve)), sleep(2000)]);
    }
  }
} finally { server.kill('SIGTERM'); }
console.log(`${process.argv.includes('--shots') ? '撮影' : '10項目（Iは2調）'} 中 NG ${failures.length}`);
if (failures.length) process.exitCode = 1;
