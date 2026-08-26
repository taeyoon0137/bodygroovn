import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./FileLoader', () => ({
    fetchWithId: vi.fn(async route => ({ route })),
    readServerResponse: vi.fn(async response => response.route === '/encode'
        ? { base64: 'ZGF0YQ==' }
        : { changed: false, path: '/tmp/asset.png', extension: 'png', warnings: [] }),
}))

import { fetchWithId, readServerResponse } from './FileLoader'
import processImage from './ImageProcessorHelper'

describe('processImage asset routing', () => {
    beforeEach(() => {
        fetchWithId.mockClear()
        readServerResponse.mockClear()
    })

    it('encodes audio without sending it to PNG processing', async () => {
        const result = await processImage({ path: '/tmp/sound.mp3', assetType: 'audio', should_encode_images: true, should_compress: true, original_assets: false })
        expect(fetchWithId.mock.calls.map(call => call[0])).toEqual(['/encode'])
        expect(result).toMatchObject({ encoded: true, extension: 'mp3', encoded_data: 'data:audio/mp3;base64,ZGF0YQ==' })
    })

    it('retains JPEG paths and MIME without extension rewriting', async () => {
        const result = await processImage({ path: '/tmp/photo.jpg', assetType: 'image', should_encode_images: true, should_compress: true, original_assets: false })
        expect(fetchWithId.mock.calls.map(call => call[0])).toEqual(['/encode'])
        expect(result).toMatchObject({ encoded: true, extension: 'jpg', encoded_data: 'data:image/jpeg;base64,ZGF0YQ==' })
    })

    it('uses the PNG worker only for PNG image assets', async () => {
        await processImage({ path: '/tmp/asset.png', assetType: 'image', should_encode_images: true, png_palette_colors: 32 })
        expect(fetchWithId.mock.calls.map(call => call[0])).toEqual(['/processImage', '/encode'])
    })

    it('rejects PNG worker failures instead of completing with a null success payload', async () => {
        readServerResponse.mockRejectedValueOnce(new Error('INVALID_PNG_CRC: The PNG checksum is invalid.'))

        await expect(processImage({
            path: '/tmp/corrupt.png',
            assetType: 'image',
            should_encode_images: true,
            png_palette_colors: 32,
        })).rejects.toThrow('INVALID_PNG_CRC')
        expect(fetchWithId.mock.calls.map(call => call[0])).toEqual(['/processImage'])
    })
})
