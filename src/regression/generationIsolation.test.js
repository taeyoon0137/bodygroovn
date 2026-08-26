import fs from 'node:fs'
import vm from 'node:vm'

import {describe, expect, it, vi} from 'vitest'

function loadSourceHelper(activeGeneration) {
  const scheduled = []
  const bodymovin = {
    assetsStorage: {},
    bm_annotationsManager: {searchAssetAnnotationInLayer: vi.fn()},
    bm_audioSourceHelper: {isEmpty: () => true, reset: vi.fn()},
    bm_compsManager: {},
    bm_dataSourceHelper: {isEmpty: () => true, reset: vi.fn()},
    bm_essentialPropertiesHelper: {},
    bm_eventDispatcher: {},
    bm_fileManager: {},
    bm_renderManager: {
      imageProcessingFailed: vi.fn(),
      isRenderActive: generation => generation === activeGeneration,
    },
    bm_renderQueueHelper: {renderQueueIsBusy: () => false},
    bm_settingsHelper: {
      shouldSkipImages: () => false,
      shouldUseSourceNames: () => false,
    },
  }
  const source = fs.readFileSync('bundle/jsx/utils/sourceHelper.jsx', 'utf8')
  vm.runInNewContext(source, {
    app: {scheduleTask: code => scheduled.push(code)},
    $: {__bodymovin: bodymovin},
  })
  return {bodymovin, scheduled}
}

function loadAudioHelper(activeGeneration) {
  const scheduled = []
  const bodymovin = {
    bm_downloadManager: {},
    bm_eventDispatcher: {},
    bm_fileManager: {},
    bm_generalUtils: {},
    bm_renderManager: {isRenderActive: generation => generation === activeGeneration},
    bm_renderQueueHelper: {},
    bm_settingsHelper: {},
  }
  const source = fs.readFileSync('bundle/jsx/utils/audioSourceHelper.jsx', 'utf8')
  vm.runInNewContext(source, {
    app: {scheduleTask: code => scheduled.push(code)},
    $: {__bodymovin: bodymovin},
  })
  return {bodymovin, scheduled}
}

describe('render generation isolation', () => {
  it('drops stale source and audio scheduled callbacks after reset', () => {
    const sourceHarness = loadSourceHelper(2)
    sourceHarness.bodymovin.bm_sourceHelper.reset(2)
    sourceHarness.bodymovin.bm_sourceHelper.scheduleNextSaveImage(1)
    sourceHarness.bodymovin.bm_sourceHelper.scheduleNextSaveStilInSequence(1)

    const audioHarness = loadAudioHelper(2)
    audioHarness.bodymovin.bm_audioSourceHelper.reset(2)
    audioHarness.bodymovin.bm_audioSourceHelper.scheduleNextSave(1)

    expect(sourceHarness.scheduled).toEqual([])
    expect(audioHarness.scheduled).toEqual([])
  })

  it('fails the active render when the After Effects render queue is busy', () => {
    const harness = loadSourceHelper(2)
    harness.bodymovin.bm_renderQueueHelper.renderQueueIsBusy = () => true
    harness.bodymovin.bm_sourceHelper.reset(2)
    harness.bodymovin.bm_sourceHelper.checkImageSource({
      name: 'source.png',
      source: {height: 8, name: 'source.png', width: 8},
    })

    harness.bodymovin.bm_sourceHelper.exportImages('/tmp/output.json', [], 7, 'comp-7', 2)

    expect(harness.bodymovin.bm_renderManager.imageProcessingFailed).toHaveBeenCalledOnce()
    expect(harness.bodymovin.bm_renderManager.imageProcessingFailed).toHaveBeenCalledWith(
      expect.stringContaining('Render queue is currently busy.'),
      2,
    )
  })

  it('uses a unique report task and suppresses an inactive report', () => {
    const scheduled = []
    const completions = []
    const bodymovin = {
      bm_eventDispatcher: {log: vi.fn()},
      bm_layerReportHelper: {createLayer: vi.fn()},
    }
    const context = {
      app: {scheduleTask: code => scheduled.push(code)},
      $: {__bodymovin: bodymovin},
    }
    const source = fs.readFileSync('bundle/jsx/reports/layerCollectionReport.jsx', 'utf8')
    vm.runInNewContext(`Function.prototype.bm_bind = Function.prototype.bind;\n${source}`, context)
    let reportAActive = true
    const reportA = bodymovin.bm_layerCollectionReport(
      {length: 0},
      () => completions.push('A'),
      vi.fn(),
      () => reportAActive,
    )
    const reportB = bodymovin.bm_layerCollectionReport(
      {length: 0},
      () => completions.push('B'),
      vi.fn(),
      () => true,
    )

    reportA.process()
    reportB.process()
    expect(scheduled).toHaveLength(2)
    expect(scheduled[0]).not.toBe(scheduled[1])

    reportAActive = false
    vm.runInNewContext(scheduled[0], context)
    vm.runInNewContext(scheduled[1], context)
    expect(completions).toEqual(['B'])
  })

  it('does not let an old expression response end the new generation', () => {
    const events = []
    const oldEnd = vi.fn()
    const newEnd = vi.fn()
    const expressionProcessingFailed = vi.fn()
    const bodymovin = {
      bm_eventDispatcher: {sendEvent: (...args) => events.push(args)},
      bm_generalUtils: {random: () => 'expression-a'},
      bm_renderManager: {expressionProcessingFailed},
      bm_settingsHelper: {},
    }
    const source = fs.readFileSync('bundle/jsx/utils/expressionHelper.jsx', 'utf8')
    vm.runInNewContext(source, {$: {__bodymovin: bodymovin}})
    const helper = bodymovin.bm_expressionHelper
    helper.setCallbacks(vi.fn(), oldEnd)
    helper.reset(1)
    helper.checkExpression({expression: 'time', expressionEnabled: true, expressionError: false}, {})
    expect(events[0][1]).toMatchObject({id: 'expression-a', render_generation: 1})

    helper.setCallbacks(vi.fn(), newEnd)
    helper.reset(2)
    helper.checkExpression({expression: 'value + 1', expressionEnabled: true, expressionError: false}, {})
    expect(events[1][1]).toMatchObject({id: 'expression-a', render_generation: 2})

    helper.saveExpression({text: '0'}, 'expression-a', 1)

    expect(oldEnd).not.toHaveBeenCalled()
    expect(newEnd).not.toHaveBeenCalled()
    expect(expressionProcessingFailed).toHaveBeenCalledWith(1)
    expect(helper.checkReady()).toBe(false)

    helper.saveExpression({text: '1'}, 'expression-a', 2)
    expect(newEnd).toHaveBeenCalledOnce()
    expect(helper.checkReady()).toBe(true)
  })

  it('drains only an outstanding expression ID and rejects an unknown ID', () => {
    const expressionProcessingFailed = vi.fn()
    const onEnd = vi.fn()
    const bodymovin = {
      bm_eventDispatcher: {sendEvent: vi.fn()},
      bm_generalUtils: {random: () => 'expression-a'},
      bm_renderManager: {expressionProcessingFailed},
      bm_settingsHelper: {},
    }
    const source = fs.readFileSync('bundle/jsx/utils/expressionHelper.jsx', 'utf8')
    vm.runInNewContext(source, {$: {__bodymovin: bodymovin}})
    const helper = bodymovin.bm_expressionHelper
    helper.setCallbacks(vi.fn(), onEnd)
    helper.reset(9)
    helper.checkExpression({expression: 'time', expressionEnabled: true, expressionError: false}, {})

    helper.saveExpression({hasFailed: true}, 'expression-unknown', 9)
    expect(expressionProcessingFailed).toHaveBeenCalledWith(9)
    expect(helper.checkReady()).toBe(false)
    expect(onEnd).not.toHaveBeenCalled()

    helper.saveExpression({hasFailed: true}, 'expression-a', 9)
    expect(helper.checkReady()).toBe(true)
    expect(onEnd).toHaveBeenCalledOnce()
  })
})
