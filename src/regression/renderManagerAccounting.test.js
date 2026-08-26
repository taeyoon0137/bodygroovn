import fs from 'node:fs'
import vm from 'node:vm'

import {describe, expect, it, vi} from 'vitest'

const source = fs.readFileSync('bundle/jsx/renderManager.jsx', 'utf8')

function createHarness({failureStage, includeReport = true, temporaryFolder = true} = {}) {
  const events = []
  const reportCalls = []
  const scheduledTasks = []
  const renderComplete = vi.fn()
  const endUndoGroup = vi.fn()
  const endProject = vi.fn()
  const saveReport = vi.fn(() => '/tmp/report.json')
  const exportImages = vi.fn()
  let currentComp
  let currentSettings

  const fail = stage => {
    if (failureStage === stage) throw new Error(`${stage} failure`)
  }
  const settings = {
    set: value => {
      if (value !== null) fail('settingsSet')
      currentSettings = value
    },
    get: () => currentSettings,
    shouldBakeBeyondWorkArea: () => false,
    shouldIncludeNotSupportedProperties: () => false,
    shouldIncludeReport: () => includeReport,
    shouldSkipExternalComposition: () => false,
  }
  const bodymovin = {
    assetsStorage: {storeAssets: vi.fn()},
    bm_ProjectHelper: {
      end: endProject,
      init: () => fail('projectInit'),
    },
    bm_compsManager: {cancelled: false, renderComplete},
    bm_dataManager: {saveReport},
    bm_essentialPropertiesHelper: {
      addCompProperties: vi.fn(),
      exportProperties: () => ({}),
      reset: vi.fn(),
    },
    bm_eventDispatcher: {
      log: vi.fn(),
      sendEvent: (...args) => events.push(args),
    },
    bm_expressionHelper: {reset: vi.fn(), setCallbacks: vi.fn()},
    bm_fileManager: {createTemporaryFolder: () => temporaryFolder},
    bm_keyframeHelper: {},
    bm_layerElement: {
      checkLayerSource: vi.fn(),
      prepareLayer: () => {
        fail('prepareLayer')
        return {ddd: 0, enabled: true, isGuide: false, render: true, ty: 99}
      },
      reset: () => fail('layerReset'),
    },
    bm_projectManager: {getCompositionById: () => currentComp},
    bm_renderHelper: {popRenderRange: vi.fn(), pushRenderRange: vi.fn()},
    bm_reportsManager: {
      createReport: (comp, onComplete, onFail, isActive) => {
        fail('reportCreate')
        reportCalls.push({comp, isActive, onComplete, onFail})
      },
    },
    bm_settingsHelper: settings,
    bm_sourceHelper: {
      exportImages,
      getFonts: () => [],
      reset: () => fail('sourceReset'),
    },
    bm_textCompHelper: {reset: vi.fn()},
    bm_textShapeHelper: {
      removeComps: vi.fn(),
      reset: vi.fn(),
    },
    bm_versionHelper: {get: () => '5.12.0', getProductVersion: () => '6.0.0'},
    layerTypes: {precomp: 0, text: 5},
  }
  const app = {
    beginUndoGroup: () => fail('beginUndo'),
    endUndoGroup,
    project: {file: null},
    scheduleTask: code => {
      fail('scheduleTask')
      scheduledTasks.push(code)
      return scheduledTasks.length
    },
  }
  vm.runInNewContext(source, {app, $: {__bodymovin: bodymovin}})

  function render(id, destination = `/tmp/${id}.json`) {
    const layerCount = failureStage === 'prepareLayer' ? 1 : 0
    const layers = {length: layerCount}
    if (layerCount) layers[1] = {inPoint: 0, name: 'Layer 1', outPoint: 1}
    currentComp = {
      duration: 1,
      frameRate: 30,
      height: 1080,
      id,
      layers,
      markerProperty: null,
      motionBlur: false,
      name: `Composition ${id}`,
      width: 1920,
      workAreaDuration: 1,
      workAreaStart: 0,
    }
    const compSettings = {
      extraComps: {active: false, list: []},
      guideds: false,
      hiddens: false,
      metadata: null,
      shouldTrimData: false,
      should_include_av_assets: true,
    }
    bodymovin.bm_renderManager.render(currentComp, destination, destination, compSettings, `uid-${id}`)
  }

  return {
    bodymovin,
    endProject,
    endUndoGroup,
    events,
    exportImages,
    render,
    renderComplete,
    reportCalls,
    saveReport,
    scheduledTasks,
  }
}

describe('render manager completion accounting', () => {
  it('completes exactly once when the temporary export folder cannot be created', () => {
    const harness = createHarness({temporaryFolder: false})

    harness.render(42, '/tmp/animation.json')

    expect(harness.renderComplete).toHaveBeenCalledTimes(1)
    expect(harness.endUndoGroup).not.toHaveBeenCalled()
    expect(harness.events).toContainEqual(['bm:render:update', {
      compId: 42,
      fsPath: '/tmp/animation.json',
      isFinished: false,
      message: 'Render Failed ',
      progress: 1,
      type: 'update',
    }])
  })

  it.each([
    ['sourceReset', 0],
    ['settingsSet', 0],
    ['beginUndo', 0],
    ['projectInit', 1],
    ['layerReset', 1],
    ['prepareLayer', 1],
    ['reportCreate', 1],
    ['scheduleTask', 1],
  ])('completes exactly once when %s throws during setup', (failureStage, expectedUndoGroups) => {
    const harness = createHarness({failureStage})

    harness.render(7)

    expect(harness.renderComplete).toHaveBeenCalledTimes(1)
    expect(harness.endUndoGroup).toHaveBeenCalledTimes(expectedUndoGroups)
    expect(harness.events.filter(([name]) => name === 'bm:render:update').at(-1)?.[1]).toMatchObject({
      compId: 7,
      isFinished: false,
      message: 'Render Failed ',
    })
  })

  it('ignores a failed render report after the next render starts', () => {
    const harness = createHarness()
    harness.render(1, '/dest/A.json')
    const reportA = harness.reportCalls[0]

    harness.bodymovin.bm_renderManager.imageProcessingFailed('Image A failed.')
    harness.bodymovin.bm_compsManager.cancelled = false
    harness.render(2, '/dest/B.json')
    const reportB = harness.reportCalls[1]

    expect(reportA.isActive()).toBe(false)
    reportA.onComplete({serialize: () => ({id: 'A'})})
    expect(harness.saveReport).not.toHaveBeenCalled()
    expect(harness.events.filter(([name]) => name === 'bm:report:saved')).toEqual([])

    reportB.onComplete({serialize: () => ({id: 'B'})})
    expect(harness.saveReport).toHaveBeenCalledWith({id: 'B'}, '/dest/B.json')
    expect(harness.events).toContainEqual(['bm:report:saved', {
      compId: 2,
      reportPath: '/tmp/report.json',
    }])
  })

  it('ignores a scheduled layer callback from a prior generation', () => {
    const harness = createHarness({includeReport: false})
    harness.render(1, '/dest/A.json')
    harness.bodymovin.bm_renderManager.imageProcessingFailed('Image A failed.')
    harness.bodymovin.bm_compsManager.cancelled = false
    harness.render(2, '/dest/B.json')

    harness.bodymovin.bm_renderManager.renderNextLayer(1)
    expect(harness.exportImages).not.toHaveBeenCalled()

    harness.bodymovin.bm_renderManager.renderNextLayer(2)
    expect(harness.exportImages).toHaveBeenCalledTimes(1)
    expect(harness.exportImages.mock.calls[0]).toEqual([
      '/dest/B.json',
      [],
      2,
      'uid-2',
      2,
    ])
  })

  it('alerts and aborts the active render when expression processing fails', () => {
    const harness = createHarness({includeReport: false})
    harness.render(3)

    harness.bodymovin.bm_renderManager.expressionProcessingFailed(1)

    expect(harness.renderComplete).toHaveBeenCalledOnce()
    expect(harness.events).toContainEqual(['bm:alert', {
      message: 'Could not process an expression because its response was malformed.',
    }])
  })
})
