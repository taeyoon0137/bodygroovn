import { describe, expect, it } from 'vitest'
import { getPaletteColors } from './pngSettings'

describe('getPaletteColors', () => {
    it.each([0, 32, 64, 128, 256])('preserves an existing valid %i-color setting', (png_palette_colors) => {
        expect(getPaletteColors({ png_palette_colors, should_compress: true })).toBe(png_palette_colors)
    })

    it('migrates legacy compression only for non-original assets', () => {
        expect(getPaletteColors({ should_compress: true, original_assets: false })).toBe(256)
        expect(getPaletteColors({ should_compress: true, original_assets: true })).toBe(0)
        expect(getPaletteColors({ should_compress: false, original_assets: false })).toBe(0)
    })

    it('falls back from invalid palette values', () => {
        expect(getPaletteColors({ png_palette_colors: 12, should_compress: true, original_assets: false })).toBe(256)
    })
})
