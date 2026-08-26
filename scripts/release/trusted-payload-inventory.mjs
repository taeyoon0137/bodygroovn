export function normalizeTrustedPayloadPath(filePath) {
  return filePath.replace(
    /^assets\/index-[A-Za-z0-9_-]{8}\.(css|js)$/,
    'assets/index-[hash].$1',
  )
}

export function assertTrustedPayloadInventory(actualPaths, expectedPaths) {
  const expected = [...expectedPaths]
  if (expected.join('\n') !== [...expected].sort().join('\n')
    || new Set(expected).size !== expected.length) {
    throw new Error('Trusted payload inventory must be sorted and contain no duplicates')
  }

  const actual = actualPaths.map(normalizeTrustedPayloadPath).sort()
  if (actual.join('\n') !== expected.join('\n')) {
    throw new Error('Unsigned payload does not match the trusted v6 inventory')
  }
}
