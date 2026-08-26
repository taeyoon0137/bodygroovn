import fs from 'node:fs'
import vm from 'node:vm'

import {describe, expect, it, vi} from 'vitest'

const source = fs.readFileSync('bundle/jsx/exporters/standardExporter.jsx', 'utf8')

function loadExporter({copyFile, exporterHelpers: exporterHelperOverrides = {}, fileManager: fileManagerOverrides = {}, parseDestination} = {}) {
  const events = []
  const fileManager = {
    createFile: () => ({file: {fsName: '/tmp/output'}}),
    getFileById: () => null,
    getFilesOnPath: () => [],
    getTemporaryFolder: () => ({fsName: '/tmp/bodygroovn'}),
    removeFile: () => {},
    ...fileManagerOverrides,
  }
  const bodymovin = {
    bm_eventDispatcher: {
      sendEvent: (...args) => events.push(args),
    },
    bm_exporterHelpers: {
      commitTransaction: vi.fn(),
      copyFile: copyFile || ((source, destination) => {
        if (source.copy(destination.fsName) === false) throw new Error('copy failed')
        return true
      }),
      createTransaction: () => ({records: []}),
      ensureFolder: folder => {
        if (!folder.exists && folder.create() === false) throw new Error('create failed')
      },
      exportStatuses: {FAILED: 'failed', SUCCESS: 'success'},
      exportTypes: {STANDARD: 'standard'},
      parseDestination: parseDestination
        || (() => ({fileName: 'animation', folder: {fsName: '/tmp/export'}})),
      removeQuietly: file => file.remove(),
      rollbackTransaction: vi.fn(),
      ...exporterHelperOverrides,
    },
    bm_fileManager: fileManager,
  }
  function File(path) {
    this.fsName = path
    this.name = path.split('/').pop()
    this.changePath = nextPath => {
      this.name = nextPath
      this.fsName = nextPath
    }
    this.copy = () => true
    this.remove = vi.fn(() => true)
  }
  function Folder(path) {
    this.exists = true
    this.fsName = path
    this.changePath = nextPath => {
      this.fsName += `/${nextPath}`
    }
    this.create = () => true
  }
  vm.runInNewContext(source, {File, Folder, $: {__bodymovin: bodymovin}})
  return {events, exporter: bodymovin.bm_standardExporter}
}

function save(exporter, config) {
  const callbacks = []
  exporter.save('/tmp/animation.json', config, (...args) => callbacks.push(args))
  return callbacks
}

describe('standard exporter completion accounting', () => {
  it('completes an enabled standard export exactly once after success', () => {
    const {exporter} = loadExporter()
    const callbacks = save(exporter, {
      export_modes: {standard: true},
      segmented: false,
    })

    expect(callbacks).toEqual([['standard', 'success']])
  })

  it('completes a disabled standard export exactly once', () => {
    const {exporter} = loadExporter()
    const callbacks = save(exporter, {
      export_modes: {standard: false},
      segmented: false,
    })

    expect(callbacks).toEqual([['standard', 'success']])
  })

  it('completes a failed standard export exactly once', () => {
    const {exporter} = loadExporter({
      parseDestination: () => {
        throw new Error('destination failed')
      },
    })
    const callbacks = save(exporter, {
      export_modes: {standard: true},
      segmented: false,
    })

    expect(callbacks).toEqual([['standard', 'failed']])
  })

  it('completes exactly once when Adobe copy returns false', () => {
    const sourceFile = {copy: () => false, exists: true}
    const {exporter} = loadExporter({
      fileManager: {
        createFile: () => ({file: {fsName: '/tmp/output', remove: () => true}}),
        getFileById: () => ({file: sourceFile, name: 'image.png', path: ['raw', 'images']}),
        getFilesOnPath: path => path[0] === 'raw' ? [{id: 'image'}] : [],
      },
    })
    const callbacks = save(exporter, {
      export_modes: {standard: true},
      segmented: false,
    })

    expect(callbacks).toEqual([['standard', 'failed']])
  })

  it('keeps a segmented standard export complete after a late failure', () => {
    const {events, exporter} = loadExporter()
    const callbacks = save(exporter, {
      export_modes: {standard: true},
      segmented: true,
      segmentedTime: 2,
    })

    expect(events).toHaveLength(1)
    exporter.splitSuccess(2)
    exporter.splitFailed()
    expect(callbacks).toEqual([['standard', 'success']])
  })

  it('completes a segmented export exactly once when a segment file cannot be created', () => {
    let createCount = 0
    const {exporter} = loadExporter({
      fileManager: {
        createFile: () => {
          createCount += 1
          if (createCount > 1) throw new Error('create returned false')
          return {file: {fsName: '/tmp/output'}, id: 'segment-0'}
        },
      },
    })
    const callbacks = save(exporter, {
      export_modes: {standard: true},
      segmented: true,
      segmentedTime: 2,
    })

    exporter.splitSuccess(2)
    exporter.splitFailed()
    expect(callbacks).toEqual([['standard', 'failed']])
  })

  it('restores every existing destination when a later copy fails', () => {
    const destinationState = {A: 'OLD', B: 'OLD'}
    const firstAsset = {content: 'NEW-A', exists: true}
    const failingAsset = {content: 'NEW-B', exists: true}
    const files = {
      first: {file: firstAsset, name: 'A', path: ['standard']},
      failing: {file: failingAsset, name: 'B', path: ['standard']},
    }
    const transaction = {records: []}
    const rollbackTransaction = vi.fn(currentTransaction => {
      for (let index = currentTransaction.records.length - 1; index >= 0; index -= 1) {
        const record = currentTransaction.records[index]
        destinationState[record.name] = record.previous
      }
    })
    const {exporter} = loadExporter({
      copyFile: (source, destination, currentTransaction) => {
        expect(currentTransaction).toBe(transaction)
        if (destination.name === 'B') throw new Error('copy failed')
        transaction.records.push({name: destination.name, previous: destinationState[destination.name]})
        destinationState[destination.name] = source.content
      },
      exporterHelpers: {
        createTransaction: () => transaction,
        rollbackTransaction,
      },
      fileManager: {
        getFileById: id => files[id],
        getFilesOnPath: path => path[0] === 'standard'
          ? [{id: 'first'}, {id: 'failing'}]
        : [],
      },
    })
    const callbacks = save(exporter, {
      export_modes: {standard: true},
      segmented: false,
    })

    expect(callbacks).toEqual([['standard', 'failed']])
    expect(rollbackTransaction).toHaveBeenCalledOnce()
    expect(destinationState).toEqual({A: 'OLD', B: 'OLD'})
  })
})
