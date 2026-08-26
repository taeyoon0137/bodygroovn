import fs from 'node:fs'
import vm from 'node:vm'

import {beforeEach, describe, expect, it, vi} from 'vitest'

const bridge = vi.hoisted(() => ({
  actions: [],
  evalScripts: [],
  listeners: new Map(),
  sentCommands: [],
}))

vi.mock('../helpers/CSInterfaceHelper', () => ({
  default: {
    addEventListener: (name, listener) => bridge.listeners.set(name, listener),
    evalScript: script => bridge.evalScripts.push(script),
  },
  getXMPValue: vi.fn(),
  sendAsyncCommand: (...args) => bridge.sentCommands.push(args),
  sendCommandWithListeners: vi.fn(),
}))
vi.mock('../helpers/ExtensionLoader', () => ({default: Promise.resolve()}))
vi.mock('../helpers/storeDispatcher', () => ({
  dispatcher: action => bridge.actions.push(action),
}))
vi.mock('../redux/actions/actionTypes', () => ({default: {WRITE_ERROR: 'WRITE_ERROR'}}))
vi.mock('../redux/actions/generalActions', () => ({
  appVersionFetched: vi.fn(),
  versionFetched: vi.fn(),
}))
vi.mock('../redux/actions/reportsActions', () => ({
  reportsSaveFailed: (compId, message) => ({compId, message, type: 'REPORTS_SAVE_FAILED'}),
  reportsSaved: (compId, reportPath) => ({compId, reportPath, type: 'REPORTS_SAVED'}),
}))
vi.mock('../redux/actions/renderActions', () => ({
  processExpression: data => ({data, type: 'PROCESS_EXPRESSION'}),
}))
vi.mock('../helpers/splitAnimationHelper', () => ({splitAnimation: vi.fn()}))
vi.mock('../helpers/osHelper', () => ({getSimpleSeparator: () => '/'}))

const compositionsProvider = await import('../helpers/CompositionsProvider')

function loadExporter(fileName, exportType, fileOverrides = {}) {
  const source = fs.readFileSync(`bundle/jsx/exporters/${fileName}Exporter.jsx`, 'utf8')
  const transaction = {records: []}
  const bodymovin = {
    JSON,
    bm_downloadManager: {
      getDemoData: () => '"__[[ANIMATIONDATA]]__" __[[RENDERER]]__ __[[BODY_BACKGROUND_COLOR]]__ __[[LOTTIE_BACKGROUND_COLOR]]__',
      getStandaloneData: () => '"__[ANIMATIONDATA]__" "__[STANDALONE]__"',
    },
    bm_eventDispatcher: {sendEvent: vi.fn()},
    bm_exporterHelpers: {
      commitTransaction: vi.fn(),
      createTransaction: vi.fn(() => transaction),
      exportStatuses: {FAILED: 'failed', SUCCESS: 'success'},
      exportTypes: {[exportType.toUpperCase()]: exportType},
      getJsonData: () => '{}',
      parseDestination: () => ({fileName: 'animation', folder: {fsName: '/tmp/export'}}),
      rollbackTransaction: vi.fn(),
      saveAssets: vi.fn(() => []),
      writeTextFile: vi.fn((file, content) => {
        if (file.open('w', 'TEXT', '????') === false) throw new Error('open failed')
        file.encoding = 'UTF-8'
        if (file.write(content) === false) throw new Error('write failed')
        if (file.close() === false) throw new Error('close failed')
      }),
    },
    bm_fileManager: {getFilesOnPath: () => []},
  }
  function File(path) {
    this.fsName = path
    this.changePath = nextPath => {
      this.fsName = nextPath
    }
    this.close = vi.fn(() => fileOverrides.close ?? true)
    this.open = vi.fn(() => fileOverrides.open ?? true)
    this.remove = vi.fn(() => true)
    this.write = vi.fn(() => fileOverrides.write ?? true)
  }
  function Folder(path) {
    this.fsName = path
  }
  vm.runInNewContext(source, {File, Folder, $: {__bodymovin: bodymovin}})
  return {
    bodymovin,
    exporter: bodymovin[`bm_${fileName}Exporter`],
  }
}

function saveExporter(exporter, exportType, enabled, data = {}) {
  const callbacks = []
  exporter.save('/tmp/animation.json', {
    demoData: {backgroundColor: '#fff'},
    export_modes: {[exportType]: enabled},
  }, (...args) => callbacks.push(args), data)
  return callbacks
}

beforeEach(() => {
  bridge.actions.length = 0
  bridge.evalScripts.length = 0
  bridge.sentCommands.length = 0
  window.__bodygroovnNodeBridge = {
    setExportDestination: vi.fn(async destination => destination),
  }
})

describe('retained exporter contracts', () => {
  it('defines only demo, standalone, and standard export types', () => {
    const source = fs.readFileSync('bundle/jsx/exporters/exporterHelpers.jsx', 'utf8')
    const bodymovin = {JSON, bm_eventDispatcher: {}, bm_fileManager: {}}

    vm.runInNewContext(source, {File: vi.fn(), Folder: vi.fn(), $: {__bodymovin: bodymovin}})

    expect({...bodymovin.bm_exporterHelpers.exportTypes}).toEqual({
      DEMO: 'demo',
      STANDALONE: 'standalone',
      STANDARD: 'standard',
    })
  })

  it.each([
    ['demo', {}],
    ['standalone', undefined],
  ])('completes an enabled %s export exactly once after success', (exportType, data) => {
    const {exporter} = loadExporter(exportType, exportType)

    expect(saveExporter(exporter, exportType, true, data)).toEqual([[exportType, 'success']])
  })

  it.each([
    ['demo', {}],
    ['standalone', undefined],
  ])('commits %s assets and the main file through one transaction', (exportType, data) => {
    const {bodymovin, exporter} = loadExporter(exportType, exportType)

    expect(saveExporter(exporter, exportType, true, data)).toEqual([[exportType, 'success']])
    const transaction = bodymovin.bm_exporterHelpers.createTransaction.mock.results[0].value
    expect(bodymovin.bm_exporterHelpers.saveAssets.mock.calls[0][2]).toBe(transaction)
    expect(bodymovin.bm_exporterHelpers.writeTextFile.mock.calls[0][2]).toBe(transaction)
    expect(bodymovin.bm_exporterHelpers.commitTransaction).toHaveBeenCalledWith(transaction)
    expect(bodymovin.bm_exporterHelpers.rollbackTransaction).not.toHaveBeenCalled()
  })

  it.each(['demo', 'standalone'])('completes a disabled %s export exactly once', exportType => {
    const {exporter} = loadExporter(exportType, exportType)

    expect(saveExporter(exporter, exportType, false)).toEqual([[exportType, 'success']])
  })

  it.each(['demo', 'standalone'])('completes a failed %s export exactly once', exportType => {
    const {bodymovin, exporter} = loadExporter(exportType, exportType)
    bodymovin.bm_exporterHelpers.parseDestination = () => {
      throw new Error('destination failed')
    }

    expect(saveExporter(exporter, exportType, true)).toEqual([[exportType, 'failed']])
  })

  it.each([
    ['demo', 'open'],
    ['demo', 'write'],
    ['demo', 'close'],
    ['standalone', 'open'],
    ['standalone', 'write'],
    ['standalone', 'close'],
  ])('completes an enabled %s export exactly once when Adobe %s returns false', (exportType, method) => {
    const {exporter} = loadExporter(exportType, exportType, {[method]: false})

    expect(saveExporter(exporter, exportType, true)).toEqual([[exportType, 'failed']])
  })

  it('rolls back copied demo assets when the final file write fails', () => {
    const {bodymovin, exporter} = loadExporter('demo', 'demo', {write: false})

    expect(saveExporter(exporter, 'demo', true)).toEqual([['demo', 'failed']])
    expect(bodymovin.bm_exporterHelpers.rollbackTransaction).toHaveBeenCalledOnce()
  })
})

describe('CEP bridge failure accounting', () => {
  it.each([
    [{encoded: true, encoded_data: 'data:image/png;base64,AA=='}, '"data:image/png;base64,AA=="'],
    [{encoded: false}, 'null'],
  ])('preserves the two-argument imageProcessed bridge contract', async (result, encodedData) => {
    compositionsProvider.imageProcessed(result, {assetType: 'image'})
    await Promise.resolve()

    expect(bridge.evalScripts).toEqual([
      `$.__bodymovin.bm_sourceHelper.imageProcessed(false,${encodedData})`,
    ])
  })

  it('delegates a nonempty malformed expression ID to the outstanding-request tracker', async () => {
    await bridge.listeners.get('bm:expression:process')({
      data: {id: 'expression-1', render_generation: 8},
    })

    expect(bridge.sentCommands).toEqual([[
      '$.__bodymovin.bm_expressionHelper.saveExpression',
      [{hasFailed: true}, 'expression-1', 8],
    ]])
  })

  it('registers the current destination before starting every render', async () => {
    const comp = {destination: '/exports/current.json', id: 7}
    window.__bodygroovnNodeBridge.setExportDestination.mockImplementation(async destination => {
      expect(destination).toBe(comp.destination)
      expect(bridge.evalScripts).toEqual([])
    })

    await compositionsProvider.renderNextComposition(comp)

    expect(window.__bodygroovnNodeBridge.setExportDestination).toHaveBeenCalledWith(comp.destination)
    expect(bridge.evalScripts).toEqual([
      '$.__bodymovin.bm_compsManager.renderComposition(' + JSON.stringify(comp) + ')',
    ])
  })

  it('scopes font completion to the render generation that requested it', async () => {
    compositionsProvider.setFonts([{fName: 'Inter-Regular'}], 12)
    await Promise.resolve()

    expect(bridge.evalScripts).toEqual([
      '$.__bodymovin.bm_renderManager.setFontData({"list":[{"fName":"Inter-Regular"}]},12)',
    ])
  })

  it('aborts the current render when an expression request has no ID', async () => {
    await bridge.listeners.get('bm:expression:process')({data: {text: 'time'}})

    expect(bridge.evalScripts).toEqual([
      '$.__bodymovin.bm_renderManager.expressionProcessingFailed(undefined)',
    ])
  })

  it('aborts only the render generation that emitted a malformed expression request', async () => {
    await bridge.listeners.get('bm:expression:process')({data: {render_generation: 7, text: 'time'}})

    expect(bridge.evalScripts).toEqual([
      '$.__bodymovin.bm_renderManager.expressionProcessingFailed(7)',
    ])
  })

  it('does not invoke a Banner callback for a malformed expression request', async () => {
    await bridge.listeners.get('bm:expression:process')({data: '{not-json'})

    expect(bridge.evalScripts.join('\n')).not.toMatch(/banner/i)
  })

  it('dispatches the report-specific action when report saving fails', () => {
    bridge.listeners.get('bm:report:save:failed')({
      data: {compId: 'comp-1', message: 'disk full'},
    })

    expect(bridge.actions).toEqual([{
      compId: 'comp-1',
      message: 'disk full',
      type: 'REPORTS_SAVE_FAILED',
    }])
  })

  it('does not invoke a Banner callback when report saving fails', () => {
    bridge.listeners.get('bm:report:save:failed')({
      data: {compId: 'comp-1', message: 'disk full'},
    })

    expect(bridge.evalScripts.join('\n')).not.toMatch(/banner/i)
  })
})
