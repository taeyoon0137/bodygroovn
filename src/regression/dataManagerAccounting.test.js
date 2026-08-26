import fs from 'node:fs'
import vm from 'node:vm'

import {describe, expect, it, vi} from 'vitest'

const source = fs.readFileSync('bundle/jsx/dataManager.jsx', 'utf8')

function loadDataManager({File: FileOverride, exporters = {}, exporterHelpers = {}, fileManager = {}} = {}) {
  const events = []
  const saveCalls = []
  const exportStatuses = {FAILED: 'failed', IDLE: 'idle', SUCCESS: 'success'}
  const exportTypes = {DEMO: 'demo', STANDALONE: 'standalone', STANDARD: 'standard'}
  const createExporter = type => ({
    save: (...args) => {
      saveCalls.push(type)
      args[2](type, exportStatuses.SUCCESS)
    },
  })
  const bodymovin = {
    JSON,
    bm_demoExporter: exporters.demo || createExporter('demo'),
    bm_eventDispatcher: {sendEvent: (...args) => events.push(args)},
    bm_exporterHelpers: {
      exportStatuses,
      exportTypes,
      parseDestination: () => ({folder: {fsName: '/tmp/report'}}),
      writeTextFile: vi.fn(),
      ...exporterHelpers,
    },
    bm_fileManager: {
      addFile: vi.fn(),
      ...fileManager,
    },
    bm_settingsHelper: {shouldPrettyPrint: () => false},
    bm_standaloneExporter: exporters.standalone || createExporter('standalone'),
    bm_standardExporter: exporters.standard || createExporter('standard'),
    layerTypes: {precomp: 0},
  }
  function DefaultFile(path) {
    this.fsName = path
    this.name = path.split('/').pop()
    this.changePath = nextPath => { this.fsName = nextPath }
  }
  vm.runInNewContext(source, {
    File: FileOverride || DefaultFile,
    $: {__bodymovin: bodymovin},
  })
  return {dataManager: bodymovin.bm_dataManager, events, saveCalls}
}

function createData() {
  return {assets: [], chars: [], comps: [], fonts: [], layers: []}
}

describe('data manager completion accounting', () => {
  it('completes all retained exporters exactly once on success', () => {
    const {dataManager, saveCalls} = loadDataManager()
    const completions = []

    expect(dataManager.saveData(createData(), '/tmp/animation.json', {}, result => completions.push(result))).toBe(true)
    expect(saveCalls).toEqual(['demo', 'standard', 'standalone'])
    expect(completions).toEqual([true])
  })

  it('completes exactly once when preparation fails before any exporter starts', () => {
    const {dataManager, events, saveCalls} = loadDataManager({
      File: function File() {
        throw new Error('destination failed')
      },
    })
    const completions = []

    expect(dataManager.saveData(createData(), '/tmp/animation.json', {}, result => completions.push(result))).toBe(false)
    expect(saveCalls).toEqual([])
    expect(completions).toEqual([false])
    expect(events.filter(([name]) => name === 'bm:alert')).toHaveLength(1)
  })

  it('completes exactly once when an exporter throws after another exporter completed', () => {
    const standard = {save: () => { throw new Error('disk full') }}
    const {dataManager, events, saveCalls} = loadDataManager({exporters: {standard}})
    const completions = []

    expect(dataManager.saveData(createData(), '/tmp/animation.json', {}, result => completions.push(result))).toBe(false)
    expect(saveCalls).toEqual(['demo'])
    expect(completions).toEqual([false])
    expect(events.filter(([name]) => name === 'bm:alert')).toHaveLength(1)
  })

  it('throws when report file writing fails', () => {
    const {dataManager} = loadDataManager({
      exporterHelpers: {
        writeTextFile: () => { throw new Error('write returned false') },
      },
    })

    expect(() => dataManager.saveReport({}, '/tmp/animation.json')).toThrow('write returned false')
  })
})
