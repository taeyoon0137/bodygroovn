import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const sourceRoot = path.resolve('src')
const sourceExtensions = new Set(['.js', '.jsx'])
const legacyLifecyclePattern = /(?:UNSAFE_)?componentWill(?:Mount|ReceiveProps|Update)/

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath)
    }

    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : []
  })
}

describe('React 19 lifecycle compatibility', () => {
  it('does not use legacy class lifecycle methods in production source', () => {
    const violations = collectSourceFiles(sourceRoot).filter((filePath) => (
      legacyLifecyclePattern.test(fs.readFileSync(filePath, 'utf8'))
    ))

    expect(violations).toEqual([])
  })
})
