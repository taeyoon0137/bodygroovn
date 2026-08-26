import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const read = (relativePath) => readFile(path.resolve(process.cwd(), relativePath), 'utf8')

describe('product and compatibility versions', () => {
  it('uses package.json as the product-version source for exactly three synchronized files', async () => {
    const [packageText, helper, manifest] = await Promise.all([
      read('package.json'),
      read('bundle/jsx/helpers/versionHelper.jsx'),
      read('bundle/CSXS/manifest.xml'),
    ])
    const productVersion = JSON.parse(packageText).version

    expect(helper).toContain(`var productVersion = '${productVersion}';`)
    expect(manifest).toContain(`ExtensionBundleVersion="${productVersion}"`)
    expect(manifest).toContain(`<Extension Id="com.bodymovin.bodymovin" Version="${productVersion}" />`)
    expect(helper.match(/var productVersion = '[^']+';/g)).toHaveLength(1)
    expect(manifest.match(/ExtensionBundleVersion="[^"]+"/g)).toHaveLength(1)
    expect(manifest.match(/<Extension Id="com\.bodymovin\.bodymovin" Version="[^"]+" \/>/g)).toHaveLength(1)
  })

  it('keeps Lottie compatibility versions at 5.12.0 while branding exports with the product version', async () => {
    const [helper, report, renderManager] = await Promise.all([
      read('bundle/jsx/helpers/versionHelper.jsx'),
      read('bundle/jsx/reports/animationReport.jsx'),
      read('bundle/jsx/renderManager.jsx'),
    ])

    expect(helper).toContain("var compatibilityVersion = '5.12.0';")
    expect(report).toContain('serializedData.version = versionHelper.get();')
    expect(renderManager).toContain('v : versionHelper.get(),')
    expect(renderManager).toContain("g: 'bodygroovn ' + versionHelper.getProductVersion()")
    expect(renderManager).toContain("sendEvent('bm:version', {value: versionHelper.getProductVersion()})")
  })

  it('keeps CEP 12 compatibility and only the supported After Effects host surface', async () => {
    const manifest = await read('bundle/CSXS/manifest.xml')

    expect(manifest).toContain('<ExtensionManifest Version="12.0"')
    expect(manifest).toContain('<RequiredRuntime Name="CSXS" Version="12.0" />')
    expect(manifest).toContain('<Host Name="AEFT" Version="[25.0,99.9]" />')
    expect(manifest).toContain('<MainPath>http://127.0.0.1:3000/</MainPath>')
    expect(manifest).toContain('<Parameter>--enable-nodejs</Parameter>')
    expect(manifest).not.toMatch(/AEFX|mixed-context|enable-media-stream|Host Name="AEFT"[^>]*Port=/)
  })
})
