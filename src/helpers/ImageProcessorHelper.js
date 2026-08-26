import { fetchWithId, readServerResponse } from './FileLoader'
import { getPaletteColors } from './pngSettings'

async function processPng(path, paletteColors) {
    const response = await fetchWithId('/processImage', {
        method: 'post',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: encodeURIComponent(path.replace(/\\/g, '/')), paletteColors })
    })
    return readServerResponse(response)
}

async function getEncodedFile(path) {
    const response = await fetchWithId('/encode', {
        method: 'post',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: encodeURIComponent(path) })
    })
    return (await readServerResponse(response)).base64
}

async function processImage(actionData) {
    const path = actionData.path
    const extensionMatch = /\.([^.\\/]+)$/.exec(path)
    const sourceExtension = extensionMatch ? extensionMatch[1].toLowerCase() : ''
    const isPng = actionData.assetType !== 'audio' && sourceExtension === 'png'
    const paletteColors = isPng ? getPaletteColors(actionData) : 0
    if (!actionData.should_encode_images && paletteColors === 0) return { encoded: false, extension: sourceExtension || 'png' }
    const processed = isPng
        ? await processPng(path, paletteColors)
        : { path, extension: sourceExtension, warnings: [] }
    if (actionData.should_encode_images) {
        let encodedImage = await getEncodedFile(processed.path)
        encodedImage = actionData.assetType === 'audio'
            ? `data:audio/mp3;base64,${encodedImage}`
            : `data:image/${sourceExtension === 'jpg' ? 'jpeg' : sourceExtension};base64,${encodedImage}`
        return { encoded_data: encodedImage, encoded: true, extension: sourceExtension, warnings: processed.warnings }
    }
    return { new_path: processed.path, encoded: false, extension: sourceExtension, warnings: processed.warnings }
}

export default processImage
