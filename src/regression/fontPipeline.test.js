import fs from 'node:fs'
import vm from 'node:vm'

import {runSaga} from 'redux-saga'
import {beforeEach, describe, expect, it, vi} from 'vitest'

const bridge = vi.hoisted(() => ({
  encodeFile: vi.fn(),
  failRender: vi.fn(),
  setFonts: vi.fn(),
}))

vi.mock('../helpers/localStorageHelper', () => ({
  getFontsFromLocalStorage: vi.fn(),
  saveFontsFromLocalStorage: vi.fn(),
}))
vi.mock('../helpers/CompositionsProvider', () => ({
  expressionProcessed: vi.fn(),
  imageProcessed: vi.fn(),
  imageProcessingFailed: bridge.failRender,
  setFonts: bridge.setFonts,
}))
vi.mock('../helpers/ImageProcessorHelper', () => ({default: vi.fn()}))
vi.mock('../helpers/FileLoader', () => ({getEncodedFile: bridge.encodeFile}))
vi.mock('../helpers/expressions/expressions', () => ({default: vi.fn()}))

const {handleRenderFonts} = await import('../redux/sagas/render_sagas')

function loadSourceHelper({inlineFonts, copyResult = true}) {
  const copies = []
  const temporaryFiles = []
  const bodymovin = {
    assetsStorage: {},
    bm_annotationsManager: {},
    bm_audioSourceHelper: {},
    bm_compsManager: {},
    bm_dataSourceHelper: {},
    bm_essentialPropertiesHelper: {},
    bm_eventDispatcher: {},
    bm_fileManager: {
      createFile: (name, path) => {
        const file = {fsName: `/ae-temp/${path.join('/')}/${name}`}
        temporaryFiles.push({file, name, path})
        return {file}
      },
    },
    bm_renderManager: {},
    bm_renderQueueHelper: {},
    bm_settingsHelper: {
      shouldBundleFonts: () => true,
      shouldInlineFonts: () => inlineFonts,
    },
  }
  function File(path) {
    this.exists = true
    this.fsName = path
    this.copy = destination => {
      copies.push([path, destination])
      return copyResult
    }
  }

  vm.runInNewContext(
    fs.readFileSync('bundle/jsx/utils/sourceHelper.jsx', 'utf8'),
    {File, $: {__bodymovin: bodymovin}},
  )
  return {bodymovin, copies, temporaryFiles}
}

function renderFontsAction(inlineFonts) {
  return {
    data: {
      bundleFonts: true,
      fonts: [{name: 'Inter', originalLocation: '/ae-temp/staging/fonts/font_0'}],
      inlineFonts,
      render_generation: 17,
    },
  }
}

function runRenderFonts(action, fonts) {
  return runSaga(
    {
      dispatch: vi.fn(),
      getState: () => ({render: {fonts}}),
    },
    handleRenderFonts,
    action,
  ).toPromise()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('bundled font staging', () => {
  it.each([
    [false, ['raw', 'images'], 'images/font_0'],
    [true, ['staging', 'fonts'], undefined],
  ])('copies %s inline fonts to isolated AE temporary storage before export', (inlineFonts, stagingPath, location) => {
    const harness = loadSourceHelper({inlineFonts})

    harness.bodymovin.bm_sourceHelper.addFont('Inter-Regular', 'Inter', 'Regular', '/fonts/Inter.ttf')

    expect(harness.temporaryFiles).toEqual([{
      file: {fsName: `/ae-temp/${stagingPath.join('/')}/font_0`},
      name: 'font_0',
      path: stagingPath,
    }])
    expect(harness.copies).toEqual([['/fonts/Inter.ttf', `/ae-temp/${stagingPath.join('/')}/font_0`]])
    const expectedFont = {
      family: 'Inter',
      name: 'Inter-Regular',
      originalLocation: `/ae-temp/${stagingPath.join('/')}/font_0`,
      style: 'Regular',
    }
    if (location) expectedFont.location = location
    expect(harness.bodymovin.bm_sourceHelper.getFonts()).toEqual([expectedFont])
  })

  it('treats an Adobe File.copy false result as a font staging failure', () => {
    const harness = loadSourceHelper({copyResult: false, inlineFonts: true})

    expect(() => {
      harness.bodymovin.bm_sourceHelper.addFont('Inter-Regular', 'Inter', 'Regular', '/fonts/Inter.ttf')
    }).toThrow('Could not copy bundled font to the temporary export folder: /fonts/Inter.ttf')
    expect(harness.bodymovin.bm_sourceHelper.getFonts()).toEqual([])
  })
})

describe('bundled font completion', () => {
  it('scopes browser font work to the active render generation', () => {
    const renderManager = fs.readFileSync('bundle/jsx/renderManager.jsx', 'utf8')

    expect(renderManager).toContain('render_generation: activeRenderGeneration')
  })

  it('preserves external font paths without encoding them', async () => {
    const fonts = [{fName: 'Inter-Regular', fPath: 'images/font_0'}]

    await runRenderFonts(renderFontsAction(false), fonts)

    expect(bridge.encodeFile).not.toHaveBeenCalled()
    expect(bridge.setFonts).toHaveBeenCalledWith([{
      fName: 'Inter-Regular',
      fPath: 'images/font_0',
      origin: 3,
    }], 17)
    expect(bridge.failRender).not.toHaveBeenCalled()
  })

  it('encodes inline fonts only from their AE temporary copies', async () => {
    bridge.encodeFile.mockResolvedValue('data:font/ttf;base64,Zm9udA==')

    await runRenderFonts(renderFontsAction(true), [{fName: 'Inter-Regular'}])

    expect(bridge.encodeFile).toHaveBeenCalledWith('/ae-temp/staging/fonts/font_0')
    expect(bridge.setFonts).toHaveBeenCalledWith([{
      fName: 'Inter-Regular',
      fPath: 'data:font/ttf;base64,Zm9udA==',
      origin: 3,
    }], 17)
    expect(bridge.failRender).not.toHaveBeenCalled()
  })

  it('fails the current render generation when inline encoding fails', async () => {
    bridge.encodeFile.mockRejectedValue(new Error('read failed'))

    await runRenderFonts(renderFontsAction(true), [{fName: 'Inter-Regular'}])

    expect(bridge.setFonts).not.toHaveBeenCalled()
    expect(bridge.failRender).toHaveBeenCalledWith(
      'Could not encode a bundled font: read failed',
      17,
    )
  })
})
