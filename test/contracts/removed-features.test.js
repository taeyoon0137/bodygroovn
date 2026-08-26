import { describe, expect, it } from 'vitest'

import {
  checkRemovedFeatureAbsence,
  checkRendererContract,
} from '../../scripts/check-removed-features.mjs'

describe('removed feature contracts', () => {
  it('keeps removed exporter features absent from production surfaces', async () => {
    await expect(checkRemovedFeatureAbsence()).resolves.toBeUndefined()
  })

  it('retains only the browser, iOS, and Android renderer memberships', async () => {
    await expect(checkRendererContract()).resolves.toBeUndefined()
  })
})
