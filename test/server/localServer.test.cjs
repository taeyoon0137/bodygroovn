'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const UPNG = require('upng-js');

const { createServer, validSplitName } = require('../../bundle/server/main');

async function fixture(options = {}) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bodygroovn-server-'));
  const controller = await createServer({ tempRoot: root, ...options });
  const connection = controller.getConnection();
  const request = (pathname, options = {}) => fetch(`http://127.0.0.1:${connection.port}${pathname}`, { ...options, headers: { ...(options.headers || {}), 'X-Bodygroovn-Token': connection.token } });
  return { root, controller, connection, request };
}

test('binds ephemerally, authenticates, rotates tokens, and exposes only allowed routes', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.controller.close(); await fs.promises.rm(f.root, { recursive: true, force: true }); });
  assert.notEqual(f.connection.port, 24801);
  assert.match(f.connection.token, /^[0-9a-f]{64}$/);
  assert.equal((await fetch(`http://127.0.0.1:${f.connection.port}/ping`)).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${f.connection.port}/ping`, { headers: { 'X-Bodygroovn-Token': 'é'.repeat(64) } })).status, 401);
  assert.equal((await f.request('/')).status, 404);
  assert.equal((await f.request('/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 405);
  assert.equal((await fetch(`http://127.0.0.1:${f.connection.port}/ping`, { method: 'OPTIONS' })).status, 204);
  const oldToken = f.connection.token;
  assert.notEqual(f.controller.rotateToken(), oldToken);
  assert.equal((await f.request('/ping')).status, 401);
});

test('enforces envelopes, content type, registered roots, and symlink realpaths', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.controller.close(); await fs.promises.rm(f.root, { recursive: true, force: true }); });
  const source = path.join(f.root, 'asset.bin');
  await fs.promises.writeFile(source, 'bodygroovn');
  assert.equal((await f.request('/encode', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await f.request('/encode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(33000) }) })).status, 413);
  const encoded = await f.request('/encode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: encodeURIComponent(source) }) });
  assert.deepEqual(await encoded.json(), { ok: true, data: { base64: Buffer.from('bodygroovn').toString('base64') } });
  const outside = path.join(path.dirname(f.root), `${path.basename(f.root)}-outside`);
  await fs.promises.writeFile(outside, 'outside');
  t.after(() => fs.promises.rm(outside, { force: true }));
  const link = path.join(f.root, 'escape');
  await fs.promises.symlink(outside, link);
  assert.equal((await f.request('/encode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: encodeURIComponent(link) }) })).status, 403);
});

test('validates split basenames without rejecting Unicode or spaces', () => {
  assert.equal(validSplitName('한국어 animation 01'), true);
  for (const name of ['', '.', '..', 'a/b', 'a\\b', 'bad:name', `bad${String.fromCharCode(0)}name`, 'x'.repeat(256)]) assert.equal(validSplitName(name), false, name);
});

test('rejects a missing split basename instead of treating it as a filename', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.controller.close(); await fs.promises.rm(f.root, { recursive: true, force: true }); });
  const response = await f.request('/splitAnimation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin: encodeURIComponent(f.root), destination: encodeURIComponent(f.root), time: 1 }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_FILE_NAME');
});

test('writes a Unicode-named split animation inside authorized roots', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.controller.close(); await fs.promises.rm(f.root, { recursive: true, force: true }); });
  const fileName = '한국어 animation';
  await fs.promises.writeFile(path.join(f.root, `${fileName}.json`), JSON.stringify({ v: '5.12.0', fr: 30, ip: 0, op: 60, layers: [], assets: [] }));
  const response = await f.request('/splitAnimation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: encodeURIComponent(f.root), destination: encodeURIComponent(f.root), fileName: encodeURIComponent(fileName), time: 1 }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.totalSegments, 0);
  assert.equal(JSON.parse(await fs.promises.readFile(path.join(f.root, `${fileName}.json`), 'utf8')).v, '5.12.0');
});

test('keeps literal percent sequences in split animation basenames', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.controller.close(); await fs.promises.rm(f.root, { recursive: true, force: true }); });
  for (const fileName of ['progress 100%', 'literal%20name']) {
    await fs.promises.writeFile(path.join(f.root, `${fileName}.json`), JSON.stringify({ v: '5.12.0', fr: 30, ip: 0, op: 60, layers: [], assets: [] }));
    const response = await f.request('/splitAnimation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: encodeURIComponent(f.root), destination: encodeURIComponent(f.root), fileName: encodeURIComponent(fileName), time: 1 }) });
    assert.equal(response.status, 200, fileName);
    assert.equal(JSON.parse(await fs.promises.readFile(path.join(f.root, `${fileName}.json`), 'utf8')).v, '5.12.0');
  }
});

test('rejects split source and output symlink escapes without modifying outside files', async (t) => {
  const f = await fixture();
  const outsideRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bodygroovn-split-outside-'));
  t.after(async () => { await f.controller.close(); await Promise.all([f.root, outsideRoot].map((item) => fs.promises.rm(item, { recursive: true, force: true }))); });
  const origin = path.join(f.root, 'origin');
  const destination = path.join(f.root, 'destination');
  await Promise.all([fs.promises.mkdir(origin), fs.promises.mkdir(destination)]);
  const outsideSource = path.join(outsideRoot, 'source.json');
  const animation = JSON.stringify({ v: '5.12.0', fr: 30, ip: 0, op: 60, layers: [], assets: [] });
  await fs.promises.writeFile(outsideSource, animation);
  await fs.promises.symlink(outsideSource, path.join(origin, 'source-escape.json'));
  const sourceResponse = await f.request('/splitAnimation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: encodeURIComponent(origin), destination: encodeURIComponent(destination), fileName: encodeURIComponent('source-escape'), time: 1 }) });
  assert.equal(sourceResponse.status, 403);
  assert.equal((await sourceResponse.json()).error.code, 'PATH_FORBIDDEN');

  const outsideOutput = path.join(outsideRoot, 'output.json');
  await fs.promises.writeFile(outsideOutput, 'outside remains unchanged');
  await fs.promises.writeFile(path.join(origin, 'output-escape.json'), animation);
  await fs.promises.symlink(outsideOutput, path.join(destination, 'output-escape.json'));
  const outputResponse = await f.request('/splitAnimation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: encodeURIComponent(origin), destination: encodeURIComponent(destination), fileName: encodeURIComponent('output-escape'), time: 1 }) });
  assert.equal(outputResponse.status, 403);
  assert.equal((await outputResponse.json()).error.code, 'PATH_FORBIDDEN');
  assert.equal(await fs.promises.readFile(outsideOutput, 'utf8'), 'outside remains unchanged');
  assert.deepEqual((await fs.promises.readdir(destination)).filter((name) => name.endsWith('.tmp')), []);
});

test('rejects invalid timing and excessive split counts before segmentation', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.controller.close(); await fs.promises.rm(f.root, { recursive: true, force: true }); });
  const requestSplit = async (fileName, animation, time) => {
    await fs.promises.writeFile(path.join(f.root, `${fileName}.json`), JSON.stringify(animation));
    return f.request('/splitAnimation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: encodeURIComponent(f.root), destination: encodeURIComponent(f.root), fileName: encodeURIComponent(fileName), time }) });
  };
  for (const [fileName, animation] of [
    ['zero-frame-rate', { fr: 0, ip: 0, op: 60, layers: [], assets: [] }],
    ['invalid-in-point', { fr: 30, ip: null, op: 60, layers: [], assets: [] }],
    ['reversed-range', { fr: 30, ip: 60, op: 30, layers: [], assets: [] }],
  ]) {
    const response = await requestSplit(fileName, animation, 1);
    assert.equal(response.status, 422, fileName);
    assert.equal((await response.json()).error.code, 'INVALID_ANIMATION');
  }
  const excessive = await requestSplit('excessive', { fr: 60, ip: 0, op: 120, layers: [], assets: [] }, 0.00001);
  assert.equal(excessive.status, 413);
  assert.equal((await excessive.json()).error.code, 'TOO_MANY_SEGMENTS');
});

test('replaces rather than accumulates the current export destination', async (t) => {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bodygroovn-temp-'));
  const first = await fs.promises.mkdtemp(path.join(path.dirname(tempRoot), 'bodygroovn-export-a-'));
  const second = await fs.promises.mkdtemp(path.join(path.dirname(tempRoot), 'bodygroovn-export-b-'));
  await fs.promises.writeFile(path.join(first, 'first.bin'), 'first');
  await fs.promises.writeFile(path.join(second, 'second.bin'), 'second');
  const controller = await createServer({ tempRoot });
  t.after(async () => { await controller.close(); await Promise.all([tempRoot, first, second].map((item) => fs.promises.rm(item, { recursive: true, force: true }))); });
  const connection = controller.getConnection();
  const encode = (pathname) => fetch(`http://127.0.0.1:${connection.port}/encode`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bodygroovn-Token': connection.token }, body: JSON.stringify({ path: encodeURIComponent(pathname) }) });
  await controller.setExportDestination(path.join(first, 'animation.json'));
  assert.equal((await encode(path.join(first, 'first.bin'))).status, 200);
  await controller.setExportDestination(path.join(second, 'animation.json'));
  assert.equal((await encode(path.join(first, 'first.bin'))).status, 403);
  assert.equal((await encode(path.join(second, 'second.bin'))).status, 200);
});

test('accepts raw temp and export paths containing percent characters', async (t) => {
  const parent = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bodygroovn-percent-'));
  const tempRoot = path.join(parent, 'temp%root');
  const exportRoot = path.join(parent, 'export%20literal');
  await Promise.all([
    fs.promises.mkdir(tempRoot),
    fs.promises.mkdir(exportRoot),
  ]);
  const controller = await createServer({ tempRoot });
  t.after(async () => { await controller.close(); await fs.promises.rm(parent, { recursive: true, force: true }); });
  assert.equal(await controller.setExportDestination(path.join(exportRoot, 'animation.json')), await fs.promises.realpath(exportRoot));
});

test('processes a static PNG through the worker and keeps PNG output', async (t) => {
  const f = await fixture();
  t.after(async () => { await f.controller.close(); await fs.promises.rm(f.root, { recursive: true, force: true }); });
  const rgba = new Uint8Array(64 * 64 * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = (index / 4) % 256;
    rgba[index + 1] = Math.floor(index / 256) % 256;
    rgba[index + 2] = (index / 8) % 256;
    rgba[index + 3] = 255;
  }
  const pathname = path.join(f.root, 'gradient.png');
  await fs.promises.writeFile(pathname, Buffer.from(UPNG.encode([rgba.buffer], 64, 64, 0)));
  const response = await f.request('/processImage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: encodeURIComponent(pathname), paletteColors: 32 }) });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.extension, 'png');
  assert.deepEqual(payload.data.warnings, []);
  assert.equal((await fs.promises.readFile(pathname)).subarray(1, 4).toString('ascii'), 'PNG');
});

test('limits the single-worker queue and times out stalled work', async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bodygroovn-queue-'));
  const workerPath = path.join(root, 'stall.cjs');
  const imagePath = path.join(root, 'image.png');
  await fs.promises.writeFile(workerPath, "'use strict'; setInterval(function () {}, 1000);\n");
  await fs.promises.writeFile(imagePath, 'placeholder');
  const controller = await createServer({ tempRoot: root, workerPath, workerTimeout: 100 });
  t.after(async () => { await controller.close(); await fs.promises.rm(root, { recursive: true, force: true }); });
  const connection = controller.getConnection();
  const send = () => fetch(`http://127.0.0.1:${connection.port}/processImage`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bodygroovn-Token': connection.token }, body: JSON.stringify({ path: encodeURIComponent(imagePath), paletteColors: 32 }) });
  const requests = [send(), send(), send(), send(), send(), send()];
  const statuses = await Promise.all(requests.map(async request => (await request).status));
  assert.equal(statuses.filter(status => status === 429).length, 1);
  assert.equal(statuses.filter(status => status === 504).length, 5);
});

test('returns explicit 400, 408, 422, and 500 statuses', async (t) => {
  const f = await fixture({ requestTimeout: 30 });
  t.after(async () => { await f.controller.close(); await fs.promises.rm(f.root, { recursive: true, force: true }); });
  const imagePath = path.join(f.root, 'image.png');
  await fs.promises.writeFile(imagePath, 'placeholder');
  assert.equal((await f.request('/processImage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: encodeURIComponent(imagePath), paletteColors: 12 }) })).status, 400);
  assert.equal((await f.request('/encode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  const invalidAnimation = path.join(f.root, 'broken.json');
  await fs.promises.writeFile(invalidAnimation, '{');
  assert.equal((await f.request('/splitAnimation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: encodeURIComponent(f.root), destination: encodeURIComponent(f.root), fileName: 'broken', time: 1 }) })).status, 422);
  const timeoutStatus = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: f.connection.port, path: '/encode', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': 100, 'X-Bodygroovn-Token': f.connection.token } }, (response) => { resolve(response.statusCode); response.resume(); });
    request.on('error', reject);
    request.write('{');
  });
  assert.equal(timeoutStatus, 408);

  const crashingWorker = path.join(f.root, 'crash.cjs');
  await fs.promises.writeFile(crashingWorker, "throw new Error('worker crash');\n");
  await fs.promises.writeFile(imagePath, 'placeholder');
  const failed = await createServer({ tempRoot: f.root, workerPath: crashingWorker });
  t.after(() => failed.close());
  const failedConnection = failed.getConnection();
  const failedResponse = await fetch(`http://127.0.0.1:${failedConnection.port}/processImage`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bodygroovn-Token': failedConnection.token }, body: JSON.stringify({ path: encodeURIComponent(imagePath), paletteColors: 32 }) });
  assert.equal(failedResponse.status, 500);
});

test('reads at most 8192 bytes for type detection and accepts every palette value', async (t) => {
  let detectedLength = 0;
  const f = await fixture({ fileTypeDetector: async (buffer) => { detectedLength = buffer.length; return { ext: 'test', mime: 'application/x-test' }; } });
  t.after(async () => { await f.controller.close(); await fs.promises.rm(f.root, { recursive: true, force: true }); });
  const pathname = path.join(f.root, 'large.bin');
  await fs.promises.writeFile(pathname, Buffer.alloc(20000));
  const typeResponse = await f.request('/getType', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: encodeURIComponent(pathname) }) });
  assert.equal(typeResponse.status, 200);
  assert.equal(detectedLength, 8192);

  const echoWorker = path.join(f.root, 'echo.cjs');
  await fs.promises.writeFile(echoWorker, "const { parentPort, workerData } = require('worker_threads'); parentPort.postMessage({ ok: true, data: { changed: false, path: workerData.pathname, extension: 'png', warnings: [] } });\n");
  const palettes = await createServer({ tempRoot: f.root, workerPath: echoWorker });
  t.after(() => palettes.close());
  const connection = palettes.getConnection();
  for (const paletteColors of [0, 32, 64, 128, 256]) {
    const response = await fetch(`http://127.0.0.1:${connection.port}/processImage`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bodygroovn-Token': connection.token }, body: JSON.stringify({ path: encodeURIComponent(pathname), paletteColors }) });
    assert.equal(response.status, 200, paletteColors);
  }
});
