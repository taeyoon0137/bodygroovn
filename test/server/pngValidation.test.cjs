'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const UPNG = require('upng-js');

const { createServer } = require('../../bundle/server/main');
const { crc32, inspectPng, processPng } = require('../../bundle/server/pngWorker');
const limits = { imagePixels: 64 * 1024 * 1024, imageDecoded: 1024 * 1024 * 1024 };

function chunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return output;
}

function png(options = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(options.width || 1, 0);
  ihdr.writeUInt32BE(options.height || 1, 4);
  ihdr[8] = options.bitDepth || 8;
  ihdr[9] = 6;
  ihdr[12] = options.interlace || 0;
  const chunks = [chunk('IHDR', ihdr)];
  if (options.animated) chunks.push(chunk('acTL', Buffer.alloc(8)));
  chunks.push(chunk('IDAT', Buffer.alloc(0)));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

function staticPng(size = 64) {
  const rgba = new Uint8Array(size * size * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = (index / 4) % 256;
    rgba[index + 1] = Math.floor(index / 256) % 256;
    rgba[index + 2] = (index / 8) % 256;
    rgba[index + 3] = 255;
  }
  return Buffer.from(UPNG.encode([rgba.buffer], size, size, 0));
}

function addTextChunk(buffer, size) {
  const iendOffset = buffer.length - 12;
  return Buffer.concat([
    buffer.subarray(0, iendOffset),
    chunk('tEXt', Buffer.alloc(size, 65)),
    buffer.subarray(iendOffset),
  ]);
}

function countDecodedColors(buffer) {
  const input = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const decoded = UPNG.decode(input);
  const rgba = new Uint8Array(UPNG.toRGBA8(decoded)[0]);
  const colors = new Set();
  for (let index = 0; index < rgba.length; index += 4) {
    colors.add(`${rgba[index]},${rgba[index + 1]},${rgba[index + 2]},${rgba[index + 3]}`);
  }
  return colors.size;
}

test('validates PNG chunks, CRC, IEND, limits, and preserved variants', () => {
  assert.deepEqual(inspectPng(png(), limits), { width: 1, height: 1, bitDepth: 8, interlace: 0, animated: false });
  assert.equal(inspectPng(png({ animated: true }), limits).animated, true);
  assert.equal(inspectPng(png({ bitDepth: 16 }), limits).bitDepth, 16);
  assert.equal(inspectPng(png({ interlace: 1 }), limits).interlace, 1);
  const corrupt = png(); corrupt[corrupt.length - 1] ^= 1;
  assert.throws(() => inspectPng(corrupt, limits), /INVALID_CRC/);
  assert.throws(() => inspectPng(png({ width: 100000, height: 100000 }), limits), /IMAGE_TOO_LARGE/);
  assert.throws(() => inspectPng(Buffer.from('not png'), limits), /INVALID_PNG/);
});

test('preserves unsupported PNG variants byte-for-byte and returns one specific warning', async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bodygroovn-png-preserve-'));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const variants = [
    ['animated.png', png({ animated: true }), 'APNG_PRESERVED'],
    ['sixteen-bit.png', png({ bitDepth: 16 }), 'PNG_BIT_DEPTH_PRESERVED'],
    ['interlaced.png', png({ interlace: 1 }), 'INTERLACED_PNG_PRESERVED'],
  ];

  for (const [name, original, warning] of variants) {
    const pathname = path.join(root, name);
    await fs.promises.writeFile(pathname, original);
    const result = await processPng({ pathname, paletteColors: 32, limits });
    assert.deepEqual(result, { changed: false, path: pathname, extension: 'png', warnings: [warning] });
    assert.deepEqual(await fs.promises.readFile(pathname), original);
  }
});

test('keeps the original static PNG when palette encoding is not smaller', async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bodygroovn-png-smaller-'));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const pathname = path.join(root, 'already-small.png');
  const original = staticPng();
  await fs.promises.writeFile(pathname, original);

  const result = await processPng({ pathname, paletteColors: 256, limits });

  assert.equal(result.changed, false);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(await fs.promises.readFile(pathname), original);
});

test('atomically replaces a static PNG only when palette encoding is smaller', async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bodygroovn-png-replace-'));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const pathname = path.join(root, 'compressible.png');
  const original = addTextChunk(staticPng(), 4096);
  await fs.promises.writeFile(pathname, original);

  const result = await processPng({ pathname, paletteColors: 32, limits });
  const processed = await fs.promises.readFile(pathname);

  assert.equal(result.changed, true);
  assert.ok(processed.length < original.length);
  assert.deepEqual(inspectPng(processed, limits), {
    width: 64,
    height: 64,
    bitDepth: 8,
    interlace: 0,
    animated: false,
  });
  assert.deepEqual((await fs.promises.readdir(root)).filter((name) => name.endsWith('.tmp')), []);
});

test('processes every supported palette through the real worker and keeps zero as a no-op', async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bodygroovn-png-palettes-'));
  const controller = await createServer({ tempRoot: root });
  const connection = controller.getConnection();
  t.after(async () => {
    await controller.close();
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  for (const paletteColors of [0, 32, 64, 128, 256]) {
    const pathname = path.join(root, `palette-${paletteColors}.png`);
    const original = addTextChunk(staticPng(), 4096);
    await fs.promises.writeFile(pathname, original);
    const response = await fetch(`http://127.0.0.1:${connection.port}/processImage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bodygroovn-Token': connection.token,
      },
      body: JSON.stringify({ path: encodeURIComponent(pathname), paletteColors }),
    });
    const payload = await response.json();
    const processed = await fs.promises.readFile(pathname);

    assert.equal(response.status, 200, JSON.stringify({ paletteColors, payload }));
    assert.equal(payload.ok, true);
    assert.equal(payload.data.changed, paletteColors !== 0);
    assert.deepEqual(payload.data.warnings, []);

    if (paletteColors === 0) {
      assert.deepEqual(processed, original);
    } else {
      assert.ok(processed.length < original.length, `${paletteColors} colors should reduce the PNG size`);
      assert.ok(countDecodedColors(processed) <= paletteColors, `${paletteColors} colors should cap the decoded palette`);
      assert.deepEqual(inspectPng(processed, limits), {
        width: 64,
        height: 64,
        bitDepth: 8,
        interlace: 0,
        animated: false,
      });
    }
  }
});

test('cleans up its sibling temporary file when atomic replacement fails', async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bodygroovn-png-atomic-'));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const pathname = path.join(root, 'compressible.png');
  const original = addTextChunk(staticPng(), 4096);
  await fs.promises.writeFile(pathname, original);
  t.mock.method(fs.promises, 'rename', async () => {
    throw Object.assign(new Error('rename failed'), { code: 'EACCES' });
  });

  await assert.rejects(
    processPng({ pathname, paletteColors: 32, limits }),
    /rename failed/,
  );

  assert.deepEqual(await fs.promises.readFile(pathname), original);
  assert.deepEqual((await fs.promises.readdir(root)).filter((name) => name.endsWith('.tmp')), []);
});
