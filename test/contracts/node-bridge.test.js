import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import vm from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

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
    expect(html).toContain('var node = window.cep_node;')
    expect(html).not.toContain('window.require')
    expect(html).not.toMatch(/\b__dirname\b/)
    expect(html).toContain('window.__bodygroovnNodeBridge = Object.freeze({')
  })

  it('boots in CEP separate context and restarts with a new connection', async () => {
    const html = await readFile(path.join(repositoryRoot, 'index.html'), 'utf8')
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1])
    const bridgeScript = scripts.find(script => script.includes('startBodygroovnNodeBridge'))
    expect(bridgeScript).toBeTruthy()

    const controllers = []
    let rejectNextRegistration = false
    const createServer = vi.fn(async() => {
      const id = controllers.length + 1
      const controller = {
        close: vi.fn(async() => {}),
        getConnection: vi.fn(() => ({
          port: 3000 + id,
          token: id.toString(16).padStart(64, '0'),
        })),
        setExportDestination: vi.fn(async value => {
          if (rejectNextRegistration) {
            rejectNextRegistration = false
            throw new Error('restore failed')
          }
          return value
        }),
      }
      controllers.push(controller)
      return controller
    })
    const fs = {
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      readFileSync: vi.fn(),
      statSync: vi.fn(),
      writeFile: vi.fn(),
    }
    const cepRequire = vi.fn(moduleName => {
      if (moduleName === 'path') return path.posix
      if (moduleName === 'fs') return fs
      if (moduleName === '/bodygroovn/server/main.js') return { createServer }
      throw new Error(`Unexpected CEP require: ${moduleName}`)
    })
    const context = {
      CSInterface: function CSInterface() {
        this.getSystemPath = () => '/bodygroovn'
      },
      Object,
      Promise,
      SystemPath: { EXTENSION: 'extension' },
      window: {
        cep_node: {
          Buffer,
          require: cepRequire,
        },
      },
    }

    vm.runInNewContext(bridgeScript, context)
    const bridge = context.window.__bodygroovnNodeBridge
    expect(Object.isFrozen(bridge)).toBe(true)
    expect(await bridge.getConnection()).toEqual({ port: 3001, token: '1'.padStart(64, '0') })
    expect(cepRequire).toHaveBeenCalledWith('/bodygroovn/server/main.js')

    await bridge.setExportDestination('/exports/first.json')
    expect(controllers[0].setExportDestination).toHaveBeenCalledWith('/exports/first.json')

    const restarted = await bridge.restart()
    expect(restarted).toEqual({ port: 3002, token: '2'.padStart(64, '0') })
    expect(controllers[0].close).toHaveBeenCalledOnce()
    expect(controllers[1].setExportDestination).toHaveBeenCalledWith('/exports/first.json')
    expect(createServer).toHaveBeenCalledTimes(2)
    expect(await bridge.getConnection()).toEqual(restarted)

    await bridge.setExportDestination('/exports/second.json')
    await bridge.restart()
    expect(controllers[2].setExportDestination).toHaveBeenCalledWith('/exports/second.json')

    controllers[2].setExportDestination.mockRejectedValueOnce(new Error('registration failed'))
    await expect(bridge.setExportDestination('/exports/rejected.json')).rejects.toThrow('registration failed')
    await bridge.restart()
    expect(controllers[3].setExportDestination).toHaveBeenCalledWith('/exports/second.json')

    rejectNextRegistration = true
    await expect(bridge.restart()).rejects.toThrow('restore failed')
    expect(controllers[4].close).toHaveBeenCalledOnce()

    const recovered = await bridge.restart()
    expect(recovered).toEqual({ port: 3006, token: '6'.padStart(64, '0') })
    expect(controllers[5].setExportDestination).toHaveBeenCalledWith('/exports/second.json')
  })

  it('restarts the bridge after a ping failure', async () => {
    const saga = await readFile(path.join(repositoryRoot, 'src', 'redux', 'sagas', 'project_sagas.js'), 'utf8')
    expect(saga).toContain('yield call(shouldRestart ? restartServer : initializeServer)')
    expect(saga).toContain('shouldRestart = true')
  })
})
