import fs from 'node:fs'

import {beforeEach, describe, expect, it, vi} from 'vitest'

const server = vi.hoisted(() => ({
  init: null,
}))

vi.mock('../helpers/FileLoader', () => ({
  fetchWithId: vi.fn(async (_resource, init) => {
    server.init = init
    return {ok: true}
  }),
  readServerResponse: vi.fn(async () => ({totalSegments: 2})),
}))

const {splitAnimation} = await import('../helpers/splitAnimationHelper')

describe('split animation filename encoding', () => {
  beforeEach(() => {
    server.init = null
  })

  it.each(['progress 100%', 'literal%20name'])('URI-encodes the raw basename exactly once: %s', async (fileName) => {
    await expect(splitAnimation('/tmp/origin', '/tmp/destination', fileName, 1)).resolves.toBe(2)
    expect(JSON.parse(server.init.body).fileName).toBe(encodeURIComponent(fileName))
  })

  it('passes the raw event basename from CompositionsProvider', () => {
    const source = fs.readFileSync('src/helpers/CompositionsProvider.js', 'utf8')
    expect(source).toContain('splitAnimation(data.origin, data.destination, data.fileName, data.time)')
    expect(source).not.toContain('splitAnimation(data.origin, data.destination, decodeURIComponent(data.fileName), data.time)')
  })
})
