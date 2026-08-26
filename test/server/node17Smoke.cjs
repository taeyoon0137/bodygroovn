'use strict';
const assert = require('assert').strict;
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const serverEntry = path.resolve(process.argv[2] || 'build/bodygroovn/server/main.js');
const workerEntry = path.resolve(process.argv[3] || 'build/bodygroovn/server/pngWorker.js');
const { createServer } = require(serverEntry);
const STATIC_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAAXNSR0IB2cksfwAAAM5JREFUeJy1lEEOhCAMRSFxw454AjzBXLGbubcaidNRhNb+JqYCG/77/XQKIUxx+6JXpZL9Lkhb/XpeQK4E6Vj7EZBrD9K5diIgU4qyTHsl+OgvKDLtHj1I93NsD+h+DiS4ug8nuLqPJWi4jyVouB/ng2DZf9lBe8zsHRSsdlwP2skB9qCdHBTBs/sggoH7RoKx+0YC6g5tRqAf11V7d2ibCMbJsfRAlBwLgSg5rwmkyXlNoHNfS6Bxf+YEy2/THdoa95nov3fwMLTVyWF1BaReNEbESpqzAAAAAElFTkSuQmCC',
  'base64',
);

function request(connection, pathname, body) {
  const encoded = body ? Buffer.from(JSON.stringify(body)) : null;
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: connection.port, path: pathname, method: body ? 'POST' : 'GET', headers: { ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': encoded.length } : {}), 'X-Bodygroovn-Token': connection.token } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    if (encoded) req.write(encoded);
    req.end();
  });
}

(async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bodygroovn-node17-'));
  const imagePath = path.join(root, 'smoke.png');
  await fs.promises.access(workerEntry, fs.constants.R_OK);
  await fs.promises.writeFile(imagePath, STATIC_PNG);
  const controller = await createServer({ tempRoot: root, workerPath: workerEntry });
  try {
    const connection = controller.getConnection();
    assert.match(connection.token, /^[0-9a-f]{64}$/);
    assert.deepEqual(await request(connection, '/ping'), { status: 200, body: { ok: true, data: { pong: true } } });
    assert.deepEqual(await request(connection, '/getType', { path: encodeURIComponent(imagePath) }), { status: 200, body: { ok: true, data: { fileType: { ext: 'png', mime: 'image/png' } } } });
    const processed = await request(connection, '/processImage', { path: encodeURIComponent(imagePath), paletteColors: 32 });
    assert.equal(processed.status, 200);
    assert.equal(processed.body.ok, true);
    assert.equal(processed.body.data.extension, 'png');
    assert.deepEqual((await fs.promises.readFile(imagePath)).subarray(0, 8), STATIC_PNG.subarray(0, 8));
    process.stdout.write('Bundled Node 17 local-server, file-type, and UPNG worker roundtrip passed.\n');
  } finally {
    await controller.close();
    await fs.promises.rm(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
