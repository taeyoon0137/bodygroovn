import React from 'react'
import { fireEvent, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ColorPicker from './ColorPicker'

describe('ColorPicker', () => {
  it('keeps pointer changes local until the interaction ends', () => {
    const onChange = vi.fn()
    const onChangeComplete = vi.fn()
    const view = render(
      <ColorPicker
        color="#112233"
        onChange={onChange}
        onChangeComplete={onChangeComplete}
      />,
    )

    fireEvent.pointerDown(view.getByRole('slider', { name: 'Color' }))
    fireEvent.change(view.getByLabelText('HEX'), { target: { value: 'abcdef' } })

    expect(onChange).toHaveBeenLastCalledWith('#abcdef')
    expect(onChangeComplete).not.toHaveBeenCalled()

    fireEvent.pointerUp(window)
    expect(onChangeComplete).toHaveBeenCalledOnce()
    expect(onChangeComplete).toHaveBeenCalledWith('#abcdef')
  })

  it('supports HEX and RGB entry and commits on blur', () => {
    const onChangeComplete = vi.fn()
    const view = render(
      <ColorPicker color="#112233" onChangeComplete={onChangeComplete} />,
    )

    fireEvent.change(view.getByLabelText('HEX'), { target: { value: 'a0b1c2' } })
    fireEvent.blur(view.getByLabelText('HEX'))
    expect(onChangeComplete).toHaveBeenLastCalledWith('#a0b1c2')

    fireEvent.change(view.getByLabelText('R'), { target: { value: '255' } })
    fireEvent.blur(view.getByLabelText('R'))
    expect(onChangeComplete).toHaveBeenLastCalledWith('#ffb1c2')
  })

  it('does not commit text entry until the field interaction ends', () => {
    const onChangeComplete = vi.fn()
    const view = render(
      <ColorPicker color="#112233" onChangeComplete={onChangeComplete} />,
    )
    const hexInput = view.getByLabelText('HEX')

    fireEvent.change(hexInput, { target: { value: 'a0b1c2' } })
    fireEvent.keyUp(hexInput, { key: '2' })

    expect(onChangeComplete).not.toHaveBeenCalled()

    fireEvent.blur(hexInput)
    expect(onChangeComplete).toHaveBeenCalledOnce()
    expect(onChangeComplete).toHaveBeenCalledWith('#a0b1c2')
  })

  it('commits presets immediately and exposes no alpha input', async () => {
    const user = userEvent.setup()
    const onChangeComplete = vi.fn()
    const view = render(
      <ColorPicker color="#112233" onChangeComplete={onChangeComplete} />,
    )

    await user.click(view.getByRole('button', { name: 'Set color to #f5a623' }))

    expect(onChangeComplete).toHaveBeenCalledWith('#f5a623')
    expect(view.queryByLabelText('A')).toBeNull()
    expect(view.queryByLabelText(/alpha/i)).toBeNull()
  })

  it('commits keyboard adjustments at keyup', () => {
    const onChangeComplete = vi.fn()
    const view = render(
      <ColorPicker color="#112233" onChangeComplete={onChangeComplete} />,
    )
    const saturation = view.getByRole('slider', { name: 'Color' })

    fireEvent.keyDown(saturation, { key: 'ArrowRight', keyCode: 39, which: 39 })
    expect(onChangeComplete).not.toHaveBeenCalled()
    fireEvent.keyUp(saturation, { key: 'ArrowRight', keyCode: 39, which: 39 })

    expect(onChangeComplete).toHaveBeenCalledOnce()
    expect(onChangeComplete.mock.calls[0][0]).toMatch(/^#[0-9a-f]{6}$/)
  })
})
