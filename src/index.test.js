import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const render = vi.fn()
const createRoot = vi.fn(() => ({ render }))

vi.mock('react-dom/client', () => ({ createRoot }))
vi.mock('./App', () => ({ default: () => <div>Application</div> }))

describe('application entry point', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    createRoot.mockClear()
    render.mockClear()
    vi.resetModules()
  })

  it('mounts with the React 19 root API without StrictMode', async () => {
    const container = document.getElementById('root')

    await import('./index')

    expect(createRoot).toHaveBeenCalledWith(container)
    expect(render).toHaveBeenCalledOnce()
    expect(render.mock.calls[0][0].type.name).toBe('default')
    expect(render.mock.calls[0][0].type).not.toBe(React.StrictMode)
  })
})
