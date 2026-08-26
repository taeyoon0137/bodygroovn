import React from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Bodymovin from './bodymovin'

const { animations, loadAnimation } = vi.hoisted(() => {
  const animationInstances = []
  const load = vi.fn(() => {
    const animation = {
      addEventListener: vi.fn(),
      destroy: vi.fn(),
    }
    animationInstances.push(animation)
    return animation
  })

  return {
    animations: animationInstances,
    loadAnimation: load,
  }
})

vi.mock('../../lottie', () => ({
  default: { loadAnimation },
}))

describe('Bodymovin', () => {
  beforeEach(() => {
    animations.length = 0
    loadAnimation.mockClear()
  })

  it('replaces an animation after its source props change', () => {
    const firstData = { nm: 'first' }
    const secondData = { nm: 'second' }
    const view = render(
      <Bodymovin animationData={firstData}>
        <div />
      </Bodymovin>,
    )

    expect(loadAnimation).toHaveBeenCalledOnce()
    view.rerender(
      <Bodymovin animationData={secondData}>
        <div />
      </Bodymovin>,
    )

    expect(animations[0].destroy).toHaveBeenCalledOnce()
    expect(loadAnimation).toHaveBeenCalledTimes(2)
    expect(loadAnimation.mock.calls[1][0].animationData).toBe(secondData)
  })

  it('destroys the active animation when unmounted', () => {
    const view = render(
      <Bodymovin animationData={{ nm: 'animation' }}>
        <div />
      </Bodymovin>,
    )
    const animation = animations[0]

    view.unmount()

    expect(animation.destroy).toHaveBeenCalledOnce()
  })
})
