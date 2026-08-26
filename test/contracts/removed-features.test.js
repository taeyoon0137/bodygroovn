import { describe, expect, it } from 'vitest'

import {
  checkRemovedFeatureAbsence,
  checkRendererContract,
  extractRendererMessageContract,
} from '../../scripts/check-removed-features.mjs'

describe('removed feature contracts', () => {
  it('keeps removed exporter features absent from production surfaces', async () => {
    await expect(checkRemovedFeatureAbsence()).resolves.toBeUndefined()
  })

  it('retains only the browser, iOS, and Android renderer memberships', async () => {
    await expect(checkRendererContract()).resolves.toBeUndefined()
  })

  it('pins dynamic renderer expressions and their static fallback membership', () => {
    const source = `
      var defaultRenderers = [rendererTypes.BROWSER, rendererTypes.IOS, rendererTypes.ANDROID];
      var message = {
        type: messageTypes.ERROR,
        renderers: propertyData.renderers || defaultRenderers,
      };
    `

    expect(extractRendererMessageContract('dynamic.jsx', source)).toEqual([{
      context: 'message',
      dynamicSource: 'propertyData.renderers',
      file: 'dynamic.jsx',
      message: '{type:messageTypes.ERROR}',
      ordinal: 0,
      renderers: ['BROWSER', 'IOS', 'ANDROID'],
    }])
  })
})
