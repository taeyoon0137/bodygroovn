import { describe, expect, it } from 'vitest'

import {
  assertPayloadInventory,
  normalizePayloadPath,
} from '../../scripts/payload-inventory.mjs'

describe('production payload inventory', () => {
  it('normalizes only Vite content-hashed panel assets', () => {
    expect(normalizePayloadPath('assets/index-Ab12_cd3.js')).toBe('assets/index-[hash].js')
    expect(normalizePayloadPath('assets/index-Ab12_cd3.css')).toBe('assets/index-[hash].css')
    expect(normalizePayloadPath('assets/unexpected-Ab12_cd3.js')).toBe('assets/unexpected-Ab12_cd3.js')
  })

  it('rejects any unexpected payload entry', () => {
    const expected = ['assets/index-[hash].js', 'index.html']

    expect(() => assertPayloadInventory([
      'assets/index-Ab12_cd3.js',
      'index.html',
    ], expected)).not.toThrow()
    expect(() => assertPayloadInventory([
      'assets/index-Ab12_cd3.js',
      'index.html',
      'unexpected.txt',
    ], expected)).toThrow(/Production payload inventory mismatch/)
  })
})
