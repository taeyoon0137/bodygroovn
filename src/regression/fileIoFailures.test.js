import fs from 'node:fs'
import vm from 'node:vm'

import {describe, expect, it, vi} from 'vitest'

const exporterHelpersSource = fs.readFileSync('bundle/jsx/exporters/exporterHelpers.jsx', 'utf8')
const fileManagerSource = fs.readFileSync('bundle/jsx/helpers/fileManager.jsx', 'utf8')

function loadExporterHelpers(overrides = {}) {
  const createdFiles = []
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
    this.exists = overrides.existingPaths?.includes(path) ?? false
    this.changePath = nextPath => {
      this.name = nextPath
      this.fsName = nextPath
      this.exists = overrides.existingPaths?.includes(nextPath) ?? false
    }
    this.close = vi.fn(() => overrides.close ?? true)
    this.copy = vi.fn(() => overrides.copy ?? true)
    this.open = vi.fn(() => overrides.open ?? true)
    this.read = vi.fn(() => overrides.read ?? '{}')
    this.rename = vi.fn(nextName => {
      const result = typeof overrides.rename === 'function'
        ? overrides.rename(this, nextName)
        : (overrides.rename ?? true)
      if (result !== false) {
        this.name = nextName
        this.fsName = `${this.fsName.slice(0, this.fsName.lastIndexOf('/') + 1)}${nextName}`
        this.exists = true
      }
      return result
    })
    this.remove = vi.fn(() => overrides.remove ?? true)
    this.write = vi.fn(() => overrides.write ?? true)
    createdFiles.push(this)
  }
  function Folder(path) {
    this.exists = overrides.folderExists ?? true
    this.fsName = path
    this.changePath = nextPath => { this.fsName += `/${nextPath}` }
    this.create = vi.fn(() => overrides.create ?? true)
  }
  vm.runInNewContext(exporterHelpersSource, {File, Folder, $: {__bodymovin: bodymovin}})
  return {File, bodymovin, createdFiles, files, helpers: bodymovin.bm_exporterHelpers}
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

  it.each(['open', 'close'])('removes only a sibling temporary output when Adobe %s returns false', method => {
    const {File, createdFiles, helpers} = loadExporterHelpers({[method]: false})
    const file = new File('/tmp/output.json')

    expect(() => helpers.writeTextFile(file, '{}')).toThrow(`Could not ${method} file`)
    expect(file.remove).not.toHaveBeenCalled()
    expect(createdFiles.find(candidate => candidate.fsName.includes('.bodygroovn-write-')).remove).toHaveBeenCalledOnce()
  })

  it('treats a false read result as an error while preserving it over cleanup close failure', () => {
    const {File, files, helpers} = loadExporterHelpers({close: false, read: false})
    const file = new File('/tmp/raw.json')
    files.set('main', {file})

    expect(() => helpers.getJsonData([{id: 'main', type: 'main'}])).toThrow('Could not read file')
    expect(file.close).toHaveBeenCalledOnce()
  })

  it('removes a partial temporary output and preserves the write error when close also returns false', () => {
    const {File, createdFiles, helpers} = loadExporterHelpers({close: false, write: false})
    const file = new File('/tmp/output.json')

    expect(() => helpers.writeTextFile(file, '{}')).toThrow('Could not write file')
    const temporaryFile = createdFiles.find(candidate => candidate.fsName.includes('.bodygroovn-write-'))
    expect(temporaryFile.close).toHaveBeenCalledOnce()
    expect(file.remove).not.toHaveBeenCalled()
    expect(temporaryFile.remove).toHaveBeenCalledOnce()
  })

  it('treats a false copy result as an error without removing a pre-existing destination', () => {
    const {File, createdFiles, helpers} = loadExporterHelpers({
      copy: false,
      existingPaths: ['/tmp/destination.png'],
    })
    const source = new File('/tmp/source.png')
    const destination = new File('/tmp/destination.png')

    expect(() => helpers.copyFile(source, destination)).toThrow('Could not copy file')
    expect(destination.remove).not.toHaveBeenCalled()
    expect(destination.rename).not.toHaveBeenCalled()
    expect(createdFiles.find(candidate => candidate.fsName.includes('.bodygroovn-copy-')).remove).toHaveBeenCalledOnce()
  })

  it('preserves a pre-existing destination when a text write cannot open its temporary file', () => {
    const {File, helpers} = loadExporterHelpers({
      existingPaths: ['/tmp/output.json'],
      open: false,
    })
    const destination = new File('/tmp/output.json')

    expect(() => helpers.writeTextFile(destination, '{}')).toThrow('Could not open file')
    expect(destination.remove).not.toHaveBeenCalled()
    expect(destination.rename).not.toHaveBeenCalled()
    expect(destination.exists).toBe(true)
  })

  it('restores a pre-existing destination when the temporary replacement rename fails', () => {
    const {File, createdFiles, helpers} = loadExporterHelpers({
      existingPaths: ['/tmp/output.json'],
      rename: (file, nextName) => !file.fsName.includes('.bodygroovn-write-'),
    })
    const destination = new File('/tmp/output.json')

    expect(() => helpers.writeTextFile(destination, '{}')).toThrow('Could not replace file')
    expect(destination.rename).toHaveBeenNthCalledWith(1, expect.stringContaining('.bodygroovn-backup-'))
    const backupFile = createdFiles.at(-1)
    expect(backupFile.rename).toHaveBeenCalledWith('output.json')
    expect(destination.remove).not.toHaveBeenCalled()
    expect(createdFiles.find(candidate => candidate.fsName.includes('.bodygroovn-write-')).remove).toHaveBeenCalled()
  })

  it('retains a pre-existing asset backup until transaction rollback', () => {
    const {File, files, helpers} = loadExporterHelpers({
      existingPaths: ['/tmp/source.png', 'source.png'],
    })
    const source = new File('/tmp/source.png')
    files.set('asset', {file: source})
    const transaction = helpers.createTransaction()

    helpers.saveAssets(
      [{id: 'asset', type: 'asset'}],
      {fsName: '/tmp/export'},
      transaction,
    )

    expect(transaction.records).toHaveLength(1)
    const record = transaction.records[0]
    const backupFile = record.backupFile
    expect(backupFile.remove).not.toHaveBeenCalled()

    helpers.rollbackTransaction(transaction)

    expect(transaction.records).toEqual([])
    expect(backupFile.rename).toHaveBeenCalledWith('source.png')
    expect(record.outputFile.remove).toHaveBeenCalledOnce()
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
