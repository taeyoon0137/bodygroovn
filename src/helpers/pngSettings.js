const PALETTE_VALUES = [0, 32, 64, 128, 256]

function getPaletteColors(settings) {
    const configured = Number(settings.png_palette_colors)
    if (settings.png_palette_colors !== undefined && settings.png_palette_colors !== null && settings.png_palette_colors !== '' && PALETTE_VALUES.indexOf(configured) !== -1) {
        return configured
    }
    return settings.should_compress && !settings.original_assets ? 256 : 0
}

export { getPaletteColors }
