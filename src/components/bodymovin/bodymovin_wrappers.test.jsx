import React from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BodymovinCheckbox from './bodymovin_checkbox'
import BodymovinSettings from './bodymovin_settings'
import BodymovinToggle from './bodymovin_toggle'

const animation = vi.hoisted(() => ({
  goToAndPlay: vi.fn(),
  goToAndStop: vi.fn(),
  play: vi.fn(),
  setDirection: vi.fn(),
}))

vi.mock('./bodymovin', async () => {
  const ReactModule = await vi.importActual('react')
  const MockBodymovin = ReactModule.forwardRef((props, ref) => {
    ReactModule.useImperativeHandle(ref, () => animation, [])
    ReactModule.useEffect(() => {
      props.animationLoaded()
    }, [props.animationLoaded])

    return props.children
  })

  return { default: MockBodymovin }
})

describe('Bodymovin animation wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reverses and plays the toggle animation when toggle changes', () => {
    const view = render(
      <BodymovinToggle toggle='on' animationData={{}}>
        <div />
      </BodymovinToggle>,
    )
    vi.clearAllMocks()

    view.rerender(
      <BodymovinToggle toggle='off' animationData={{}}>
        <div />
      </BodymovinToggle>,
    )

    expect(animation.setDirection).toHaveBeenCalledOnce()
    expect(animation.setDirection).toHaveBeenCalledWith(-1)
    expect(animation.play).toHaveBeenCalledOnce()
  })

  it.each([
    ['checkbox', BodymovinCheckbox],
    ['settings', BodymovinSettings],
  ])('plays the %s animation when animate becomes true', (name, Component) => {
    const view = render(
      <Component animate={false} animationData={{}}>
        <div />
      </Component>,
    )
    vi.clearAllMocks()

    view.rerender(
      <Component animate={true} animationData={{}}>
        <div />
      </Component>,
    )

    expect(animation.goToAndPlay).toHaveBeenCalledOnce()
    expect(animation.goToAndPlay).toHaveBeenCalledWith(0)
    expect(animation.goToAndStop).not.toHaveBeenCalled()
  })
})
