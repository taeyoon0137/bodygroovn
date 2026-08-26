import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

async function productionSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await productionSources(entryPath))
    } else if (/\.(?:js|jsx)$/.test(entry.name)
      && !/\.(?:test|spec)\.(?:js|jsx)$/.test(entry.name)
      && entryPath !== path.join(repositoryRoot, 'src', 'lottie.js')) {
      files.push(entryPath)
    }
  }
  return files
}

describe('CEP Node bridge boundary', () => {
  it('keeps all direct Node access inside the frozen HTML bridge', async () => {
    const files = await productionSources(path.join(repositoryRoot, 'src'))
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      expect(source, path.relative(repositoryRoot, file)).not.toMatch(
        /(?:window\.(?:cep_node|require)|\bBuffer\b|require\(['"](?:buffer|fs|http|os|path|worker_threads)['"]\))/,
      )
    }

    const html = await readFile(path.join(repositoryRoot, 'index.html'), 'utf8')
    expect(html.match(/window\.cep_node|window\.require/g)).toHaveLength(3)
    expect(html).toContain('window.__bodygroovnNodeBridge = Object.freeze({')
  })
})
