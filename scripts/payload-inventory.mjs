export function normalizePayloadPath(filePath) {
  return filePath.replace(
    /^assets\/index-[A-Za-z0-9_-]{8}\.(css|js)$/,
    'assets/index-[hash].$1',
  )
}

export function assertPayloadInventory(actualPaths, expectedPaths) {
  const expected = [...expectedPaths]
  const sortedExpected = [...expected].sort()
  if (expected.join('\n') !== sortedExpected.join('\n') || new Set(expected).size !== expected.length) {
    throw new Error('release/payload-inventory.txt must be sorted and contain no duplicates')
  }

  const actual = actualPaths.map(normalizePayloadPath).sort()
  if (actual.join('\n') !== expected.join('\n')) {
    throw new Error(`Production payload inventory mismatch\nexpected:\n${expected.join('\n')}\nactual:\n${actual.join('\n')}`)
  }
}
