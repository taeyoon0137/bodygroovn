import fs from 'node:fs'
import vm from 'node:vm'

import {describe, expect, it, vi} from 'vitest'

const exporterHelpersSource = fs.readFileSync('bundle/jsx/exporters/exporterHelpers.jsx', 'utf8')
const fileManagerSource = fs.readFileSync('bundle/jsx/helpers/fileManager.jsx', 'utf8')

function loadExporterHelpers(overrides = {}) {
  const files = new Map()
  const bodymovin = {
    JSON,
    bm_eventDispatcher: {},
    bm_fileManager: {
      getFileById: id => files.get(id),
    },
  }
  function File(path) {
    this.fsName = path
    this.name = path.split('/').pop()
    this.changePath = nextPath => {
      this.name = nextPath
      this.fsName = nextPath
    }
    this.close = vi.fn(() => overrides.close ?? true)
    this.copy = vi.fn(() => overrides.copy ?? true)
    this.open = vi.fn(() => overrides.open ?? true)
    this.read = vi.fn(() => overrides.read ?? '{}')
    this.remove = vi.fn(() => overrides.remove ?? true)
    this.write = vi.fn(() => overrides.write ?? true)
  }
  function Folder(path) {
    this.exists = overrides.folderExists ?? true
    this.fsName = path
    this.changePath = nextPath => { this.fsName += `/${nextPath}` }
    this.create = vi.fn(() => overrides.create ?? true)
  }
  vm.runInNewContext(exporterHelpersSource, {File, Folder, $: {__bodymovin: bodymovin}})
  return {File, bodymovin, files, helpers: bodymovin.bm_exporterHelpers}
}

function loadFileManager(overrides = {}) {
  const events = []
  const createdFiles = []
  const bodymovin = {
    bm_eventDispatcher: {sendEvent: (...args) => events.push(args)},
    bm_generalUtils: {random: () => 'id'},
  }
  function Folder(path) {
    this.absoluteURI = path
    this.exists = overrides.folderExists ?? true
    this.fsName = path
    this.changePath = nextPath => {
      this.absoluteURI += `/${nextPath}`
      this.fsName = this.absoluteURI
    }
    this.create = vi.fn(() => overrides.create ?? true)
    this.getFiles = () => []
  }
  Folder.temp = {absoluteURI: '/tmp'}
  function File(path) {
    this.fsName = path
    this.changePath = nextPath => { this.fsName = nextPath }
    this.close = vi.fn(() => overrides.close ?? true)
    this.open = vi.fn(() => overrides.open ?? true)
    this.remove = vi.fn(() => overrides.remove ?? true)
    this.write = vi.fn(() => overrides.write ?? true)
    createdFiles.push(this)
  }
  vm.runInNewContext(fileManagerSource, {File, Folder, $: {__bodymovin: bodymovin}})
  return {createdFiles, events, manager: bodymovin.bm_fileManager}
}

describe('checked ExtendScript file I/O', () => {
  it('accepts true results for a complete text write', () => {
    const {File, helpers} = loadExporterHelpers()
    const file = new File('/tmp/output.json')

    expect(() => helpers.writeTextFile(file, '{}')).not.toThrow()
    expect(file.remove).not.toHaveBeenCalled()
  })

  it.each(['open', 'close'])('removes a partial output when Adobe %s returns false', method => {
    const {File, helpers} = loadExporterHelpers({[method]: false})
    const file = new File('/tmp/output.json')

    expect(() => helpers.writeTextFile(file, '{}')).toThrow(`Could not ${method} file`)
    expect(file.remove).toHaveBeenCalledOnce()
  })

  it('treats a false read result as an error while preserving it over cleanup close failure', () => {
    const {File, files, helpers} = loadExporterHelpers({close: false, read: false})
    const file = new File('/tmp/raw.json')
    files.set('main', {file})

    expect(() => helpers.getJsonData([{id: 'main', type: 'main'}])).toThrow('Could not read file')
    expect(file.close).toHaveBeenCalledOnce()
  })

  it('removes a partial output and preserves the write error when close also returns false', () => {
    const {File, helpers} = loadExporterHelpers({close: false, write: false})
    const file = new File('/tmp/output.json')

    expect(() => helpers.writeTextFile(file, '{}')).toThrow('Could not write file')
    expect(file.close).toHaveBeenCalledOnce()
    expect(file.remove).toHaveBeenCalledOnce()
  })

  it('treats a false copy result as an error and removes the partial destination', () => {
    const {File, helpers} = loadExporterHelpers({copy: false})
    const source = new File('/tmp/source.png')
    const destination = new File('/tmp/destination.png')

    expect(() => helpers.copyFile(source, destination)).toThrow('Could not copy file')
    expect(destination.remove).toHaveBeenCalledOnce()
  })

  it('throws and does not register a file when a destination folder returns false from create', () => {
    const {manager} = loadFileManager({create: false, folderExists: false})
    manager.createTemporaryFolder()

    expect(() => manager.createFile('animation.json', ['raw'])).toThrow('Could not create folder')
    expect(manager.getFilesOnPath(['raw'])).toEqual([])
  })

  it('removes and unregisters a partial raw file when write returns false', () => {
    const {createdFiles, events, manager} = loadFileManager({write: false})
    manager.createTemporaryFolder()

    expect(() => manager.addFile('animation.json', ['raw'], '{}', 'main')).toThrow('Could not write file')
    expect(createdFiles.at(-1).remove).toHaveBeenCalledOnce()
    expect(manager.getFilesOnPath(['raw'])).toEqual([])
    expect(events.filter(([name]) => name === 'bm:alert')).toHaveLength(1)
  })
})
