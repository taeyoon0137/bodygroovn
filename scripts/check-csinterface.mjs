import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const EXPECTED_BYTES = 42_759;
const EXPECTED_SHA256 = '3c45400984772b88cdf4604b4763a29219f8071fdedb9a1fa19d997349003783';
const sourceUrl = new URL('../lib/CSInterface/CSInterface.js', import.meta.url);
const declarationUrl = new URL('../lib/CSInterface/CSInterface.d.ts', import.meta.url);

function uniqueMatches(text, expression) {
  return [...new Set(Array.from(text.matchAll(expression), (match) => match[1]))].sort();
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

function assertSameMembers(actual, expected, label) {
  const actualValue = actual.join(',');
  const expectedValue = expected.join(',');
  if (actualValue !== expectedValue) {
    throw new Error(`${label} mismatch\nsource: ${expectedValue}\ntypes:  ${actualValue}`);
  }
}

function classBody(text, className) {
  const marker = `declare class ${className} {`;
  const start = text.indexOf(marker);
  if (start === -1) {
    throw new Error(`Missing declaration for ${className}`);
  }
  const bodyStart = start + marker.length;
  const end = text.indexOf('\n}', bodyStart);
  if (end === -1) {
    throw new Error(`Unterminated declaration for ${className}`);
  }
  return text.slice(bodyStart, end);
}

const [sourceBuffer, declarations] = await Promise.all([
  readFile(sourceUrl),
  readFile(declarationUrl, 'utf8'),
]);

assertEqual(sourceBuffer.byteLength, EXPECTED_BYTES, 'CSInterface.js byte length');
assertEqual(createHash('sha256').update(sourceBuffer).digest('hex'), EXPECTED_SHA256, 'CSInterface.js SHA-256');

const source = sourceBuffer.toString('utf8');
const sourceConstructors = uniqueMatches(source, /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm);
const declaredConstructors = uniqueMatches(declarations, /^declare class\s+([A-Za-z_$][\w$]*)\s*{/gm);
assertEqual(sourceConstructors.length, 21, 'source constructor count');
assertSameMembers(declaredConstructors, sourceConstructors, 'top-level constructor declarations');

const sourceStatics = uniqueMatches(source, /^[A-Za-z_$][\w$]*\.([A-Za-z_$][\w$]*)\s*=/gm);
const declaredStatics = uniqueMatches(declarations, /^\s*static readonly\s+([A-Za-z_$][\w$]*)\s*:/gm);
assertEqual(sourceStatics.length, 14, 'source static member count');
assertSameMembers(declaredStatics, sourceStatics, 'static declarations');

const sourceMethods = uniqueMatches(source, /CSInterface\.prototype\.([A-Za-z_$][\w$]*)\s*=\s*function/g);
const declaredMethods = uniqueMatches(classBody(declarations, 'CSInterface'), /^\s*([A-Za-z_$][\w$]*)\([^\n]*\):/gm);
assertEqual(sourceMethods.length, 34, 'source CSInterface method count');
assertSameMembers(declaredMethods, sourceMethods, 'CSInterface method declarations');

if (!/class CSEvent[\s\S]*?\n\s*data:\s*string \| object;/.test(declarations)) {
  throw new Error('CSEvent.data is missing from the ambient declarations');
}
if (!/^declare const EvalScript_ErrMessage:/m.test(declarations)) {
  throw new Error('EvalScript_ErrMessage is missing from the ambient declarations');
}

console.log(`Verified ${fileURLToPath(sourceUrl)} (${EXPECTED_BYTES} bytes, ${EXPECTED_SHA256}).`);
