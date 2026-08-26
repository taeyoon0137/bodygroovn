import React from 'react'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Range from './Range'

describe('Range', () => {
  it('attaches drag listeners after entering the active state and cleans them up', () => {
    const addListener = vi.spyOn(document, 'addEventListener')
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const updateProgress = vi.fn()
    const view = render(
      <Range canScrub progress={0} updateProgress={updateProgress} />,
    )
    const range = view.container.firstElementChild
    range.getBoundingClientRect = () => ({ left: 10, right: 110 })

    fireEvent.mouseDown(range, { clientX: 60 })

    expect(addListener).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(addListener).toHaveBeenCalledWith('mouseup', expect.any(Function))
    expect(updateProgress).toHaveBeenCalledWith(0.5)

    fireEvent.mouseUp(document)
    expect(removeListener).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(removeListener).toHaveBeenCalledWith('mouseup', expect.any(Function))
  })
})
