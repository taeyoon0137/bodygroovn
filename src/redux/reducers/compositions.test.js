import { beforeAll, describe, expect, it } from 'vitest'

import actionTypes from '../actions/actionTypes'

let compositions

beforeAll(async () => {
  window.__adobe_cep__ = {
    getHostEnvironment: () => JSON.stringify({appName: 'AEFT', appVersion: '26.0'}),
  }
  globalThis.SystemPath = { EXTENSION: 'extension' }
  globalThis.CSInterface = class CSInterfaceMock {
    addEventListener() {}
    evalScript(_script, callback) { callback?.() }
    getOSInformation() { return 'Macintosh' }
    getSystemPath() { return '/tmp/bodygroovn' }
    removeEventListener() {}
  }
  compositions = (await import('./compositions')).default
})

function restoreComposition(settings) {
  return compositions(undefined, {
    type: actionTypes.PROJECT_STORED_DATA,
    projectData: {
      compositions: {
        1: {
          id: 1,
          settings,
        },
      },
    },
  }).items[1].settings
}

describe('composition settings migration', () => {
  it('migrates legacy PNG compression and removes retired export modes', () => {
    const settings = restoreComposition({
      original_assets: false,
      should_compress: true,
      compression_rate: 80,
      banner: {zip_files: true},
      avd: true,
      export_modes: {
        standard: true,
        banner: true,
        avd: true,
        smil: true,
        rive: true,
      },
    })

    expect(settings.png_palette_colors).toBe(256)
    expect(settings).not.toHaveProperty('should_compress')
    expect(settings).not.toHaveProperty('compression_rate')
    expect(settings).not.toHaveProperty('banner')
    expect(settings).not.toHaveProperty('avd')
    expect(settings.export_modes).toEqual({
      standard: true,
      demo: false,
      standalone: false,
      reports: false,
    })
  })

  it('preserves a valid palette setting ahead of legacy values', () => {
    const settings = restoreComposition({
      original_assets: true,
      png_palette_colors: 64,
      should_compress: false,
    })

    expect(settings.png_palette_colors).toBe(64)
  })

  it('removes all legacy compression fields idempotently', () => {
    const migrated = restoreComposition({
      original_assets: false,
      should_compress: true,
      compression_rate: 80,
      enableCompression: true,
      compression: 80,
    })
    const migratedAgain = restoreComposition(migrated)

    expect(migratedAgain.png_palette_colors).toBe(256)
    expect(migratedAgain).not.toHaveProperty('should_compress')
    expect(migratedAgain).not.toHaveProperty('compression_rate')
    expect(migratedAgain).not.toHaveProperty('enableCompression')
    expect(migratedAgain).not.toHaveProperty('compression')
    expect(migratedAgain).toEqual(migrated)
  })
})
