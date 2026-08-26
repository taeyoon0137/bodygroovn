'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const { crc32, inspectPng } = require('../../bundle/server/pngWorker');
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
