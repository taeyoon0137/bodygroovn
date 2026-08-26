import fs from 'node:fs'
import vm from 'node:vm'

import {describe, expect, it, vi} from 'vitest'

const source = fs.readFileSync('bundle/jsx/downloadManager.jsx', 'utf8')

function loadDownloadManager() {
  const createdFiles = []
  const events = []
  const bodymovin = {
    bm_eventDispatcher: {sendEvent: (...args) => events.push(args)},
  }

  function Folder(path) {
    this.absoluteURI = path
    this.parent = {absoluteURI: '/extension'}
  }
  Folder.desktop = {absoluteURI: '/desktop'}

  function File(path) {
    this.absoluteURI = path
    this.copy = vi.fn(() => true)
    this.saveDlg = vi.fn(() => ({absoluteURI: `/chosen/${path.split('/').pop()}`}))
    createdFiles.push(this)
  }

  vm.runInNewContext(source, {
    File,
    Folder,
    $: {__bodymovin: bodymovin, fileName: '/extension/jsx/initializer.jsx'},
  })

  return {createdFiles, events, manager: bodymovin.bm_downloadManager}
}

describe('player download names', () => {
  it.each([
    [false, 'lottie.js'],
    [true, 'lottie.js.gz'],
  ])('uses the retained payload name for source and destination when gzip is %s', (zipped, fileName) => {
    const {createdFiles, events, manager} = loadDownloadManager()

    manager.getPlayer(zipped)

    expect(createdFiles.map(file => file.absoluteURI)).toEqual([
      `/extension/assets/player/${fileName}`,
      `/desktop/${fileName}`,
    ])
    expect(createdFiles[0].copy).toHaveBeenCalledWith(`/chosen/${fileName}`)
    expect(events).toEqual([['bm:alert', {message: 'File saved', type: 'success'}]])
  })
})
