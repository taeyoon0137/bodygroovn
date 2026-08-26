import { useEffect, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import './ColorPicker.css'

const DEFAULT_PRESETS = [
  '#d0021b', '#f5a623', '#f8e71c', '#8b572a',
  '#7ed321', '#417505', '#bd10e0', '#9013fe',
  '#4a90e2', '#50e3c2', '#b8e986', '#000000',
  '#4a4a4a', '#9b9b9b', '#ffffff',
]

function normalizeHex(value) {
  const compact = String(value || '').trim().replace(/^#/, '')
  const expanded = compact.length === 3
    ? compact.split('').map(character => character + character).join('')
    : compact

  return /^[0-9a-f]{6}$/i.test(expanded) ? `#${expanded.toLowerCase()}` : null
}

function hexToRgb(value) {
  const normalized = normalizeHex(value) || '#000000'

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  }
}

function rgbToHex(red, green, blue) {
  const channelToHex = channel => Math.min(255, Math.max(0, Number(channel) || 0))
    .toString(16)
    .padStart(2, '0')

  return `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`
}

function ColorPicker({ color, onChange, onChangeComplete, presets = DEFAULT_PRESETS }) {
  const initialColor = normalizeHex(color) || '#000000'
  const [draftColor, setDraftColor] = useState(initialColor)
  const [hexInput, setHexInput] = useState(initialColor.slice(1))
  const draftRef = useRef(initialColor)
  const committedRef = useRef(initialColor)
  const pointerActiveRef = useRef(false)

  useEffect(() => {
    const nextColor = normalizeHex(color)

    if (nextColor) {
      draftRef.current = nextColor
      committedRef.current = nextColor
      // The adapter owns an interaction draft that must follow external resets.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftColor(nextColor)
      setHexInput(nextColor.slice(1))
    }
  }, [color])

  const updateDraft = nextValue => {
    const nextColor = normalizeHex(nextValue)

    if (!nextColor) {
      return
    }

    draftRef.current = nextColor
    setDraftColor(nextColor)
    setHexInput(nextColor.slice(1))
    if (onChange) {
      onChange(nextColor)
    }
  }

  const commit = () => {
    const nextColor = draftRef.current

    if (nextColor === committedRef.current) {
      return
    }

    committedRef.current = nextColor
    if (onChangeComplete) {
      onChangeComplete(nextColor)
    }
  }

  useEffect(() => {
    const finishPointerInteraction = () => {
      if (pointerActiveRef.current) {
        pointerActiveRef.current = false
        commit()
      }
    }

    window.addEventListener('pointerup', finishPointerInteraction)
    window.addEventListener('pointercancel', finishPointerInteraction)

    return () => {
      window.removeEventListener('pointerup', finishPointerInteraction)
      window.removeEventListener('pointercancel', finishPointerInteraction)
    }
  })

  const rgb = hexToRgb(draftColor)

  const updateRgbChannel = (channel, value) => {
    updateDraft(rgbToHex(
      channel === 'r' ? value : rgb.r,
      channel === 'g' ? value : rgb.g,
      channel === 'b' ? value : rgb.b,
    ))
  }

  const handleHexChange = event => {
    const nextInput = event.target.value.replace(/^#/, '').slice(0, 6)
    setHexInput(nextInput)
    if (/^[0-9a-f]{6}$/i.test(nextInput)) {
      updateDraft(`#${nextInput}`)
    }
  }

  const handleHexBlur = () => {
    setHexInput(draftRef.current.slice(1))
    commit()
  }

  return (
    <div
      aria-label="Color picker"
      className="bodygroovn-color-picker"
      onKeyUp={commit}
      onPointerDown={() => {
        pointerActiveRef.current = true
      }}
    >
      <HexColorPicker
        color={draftColor}
        onChange={updateDraft}
        onChangeEnd={commit}
      />
      <div className="bodygroovn-color-picker__fields">
        <label>
          <span>HEX</span>
          <input
            aria-label="HEX"
            inputMode="text"
            maxLength={6}
            onBlur={handleHexBlur}
            onChange={handleHexChange}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
            value={hexInput}
          />
        </label>
        {['r', 'g', 'b'].map(channel => (
          <label key={channel}>
            <span>{channel.toUpperCase()}</span>
            <input
              aria-label={channel.toUpperCase()}
              max="255"
              min="0"
              onBlur={commit}
              onChange={event => updateRgbChannel(channel, event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
              }}
              type="number"
              value={rgb[channel]}
            />
          </label>
        ))}
      </div>
      <div aria-label="Preset colors" className="bodygroovn-color-picker__presets">
        {presets.map(preset => {
          const presetColor = normalizeHex(preset)
          if (!presetColor) {
            return null
          }

          return (
            <button
              aria-label={`Set color to ${presetColor}`}
              key={presetColor}
              onClick={() => {
                updateDraft(presetColor)
                committedRef.current = presetColor
                if (onChangeComplete) {
                  onChangeComplete(presetColor)
                }
              }}
              style={{ backgroundColor: presetColor }}
              type="button"
            />
          )
        })}
      </div>
    </div>
  )
}

export { DEFAULT_PRESETS, hexToRgb, normalizeHex, rgbToHex }
export default ColorPicker
