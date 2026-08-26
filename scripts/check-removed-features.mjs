import { createHash } from 'node:crypto'
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import escodegen from 'escodegen'
import esprima from 'esprima'

const defaultRepositoryRoot = process.cwd()

const removedPaths = [
  'index_dev.html',
  'bundle/index_server.html',
  'bundle/localserver.html',
  'bundle/assets/player/banner_template.html',
  'bundle/jsx/exporters/avdExporter.jsx',
  'bundle/jsx/exporters/bannerExporter.jsx',
  'bundle/jsx/exporters/riveExporter.jsx',
  'bundle/jsx/exporters/smilExporter.jsx',
  'bundle/server/lottie_to_flare/main.bundle.js',
  'bundle/server/lottie_to_flare/test.bundle.js',
  'bundle/server/public/canvaskit.js',
  'bundle/server/public/canvaskit.wasm',
  'public/canvaskit.js',
  'src/helpers/SkottieLoader.js',
  'src/helpers/avdHelper.js',
  'src/helpers/bannerHelper.js',
  'src/helpers/catFactHelper.js',
  'src/helpers/lottieSlotsConverter.js',
  'src/helpers/lottieSlots.js',
  'src/helpers/nasaHelper.js',
  'src/helpers/riveHelper.js',
  'src/helpers/skottie/skottie.js',
  'src/helpers/smilHelper.js',
  'src/redux/selectors/settings_avd_selector.js',
  'src/redux/selectors/settings_banner_selector.js',
  'src/redux/selectors/settings_rive_selector.js',
  'src/redux/selectors/settings_smil_selector.js',
  'src/views/preview/viewer/SkottiePreviewer.jsx',
  'src/views/settings/SettingsBanner.jsx',
  'src/views/settings/SettingsExportModeAVD.jsx',
  'src/views/settings/SettingsExportModeFlare.jsx',
  'src/views/settings/SettingsExportModeSMIL.jsx',
]

const sourceRoots = [
  'src',
  'bundle/jsx',
  'bundle/server',
  'player',
]

const forbiddenSourcePatterns = [
  { label: 'Banner route', pattern: /['"]\/createBanner(?:[/'"]|$)/i },
  { label: 'Flare conversion route', pattern: /['"]\/convertToFlare(?:[/'"]|$)/i },
  { label: 'path disclosure route', pattern: /['"]\/fileFromPath(?:[/'"]|$)/i },
  { label: 'CanvasKit route or fetch', pattern: /(?:['"]\/canvaskit(?:\.js|\.wasm)|unpkg\.com\/[^\s'"]*canvaskit)/i },
  { label: 'legacy slots bridge event', pattern: /bm:create:slots/i },
  { label: 'Skottie renderer', pattern: /(?:rendererTypes\.SKOTTIE|['"]skottie['"])/i },
  { label: 'Rive helper or exporter', pattern: /(?:riveHelper|riveExporter|exportTypes\.RIVE|bm:create:rive|RIVE\/SAVE_DATA|SETTINGS\/RIVE|export_modes\.rive)/i },
  { label: 'AVD helper or exporter', pattern: /(?:avdHelper|avdExporter|SettingsExportModeAVD|exportTypes\.AVD|bm:create:avd|RENDER\/CREATE_AVD|export_modes\.avd)/i },
  { label: 'SMIL helper or exporter', pattern: /(?:smilHelper|smilExporter|SettingsExportModeSMIL|exportTypes\.SMIL|bm:create:smil|RENDER\/CREATE_SMIL|export_modes\.smil)/i },
  { label: 'Banner helper or exporter', pattern: /(?:bannerHelper|bannerExporter|SettingsBanner|settings_banner_selector|exportTypes\.BANNER|bm:(?:zip|create):banner|SETTINGS\/BANNER|export_modes\.banner)/i },
  { label: 'Skottie or CanvasKit integration', pattern: /(?:SkottieLoader|SkottiePreviewer|helpers\/skottie|canvaskit\.wasm)/i },
  { label: 'legacy local server panel', pattern: /(?:index_server\.html|localserver\.html|bodymovin_server)/i },
  { label: 'Howler runtime', pattern: /(?:\bHowl(?:er)?\b|['"]howler['"]|require\(['"]howler['"]\))/i },
  { label: 'cat fact helper', pattern: /catFactHelper/i },
  { label: 'NASA helper', pattern: /nasaHelper/i },
]

const removedDependencyNames = new Set([
  'canvaskit-wasm',
  'express',
  'howler',
  'react-color',
  'react-colorful-alpha',
  'serve-static',
])

async function pathExists(absolutePath) {
  try {
    await access(absolutePath)
    return true
  } catch {
    return false
  }
}

async function collectTextFiles(repositoryRoot, relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath)
  if (!(await pathExists(absolutePath))) return []

  const entries = await readdir(absolutePath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const child = path.posix.join(relativePath, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectTextFiles(repositoryRoot, child))
    } else if (entry.isFile() && /\.(?:cjs|html|js|jsx|json|mjs)$/i.test(entry.name)) {
      files.push(child)
    }
  }
  return files
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

function dependencySections(packageJson) {
  return [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ].filter(Boolean)
}

export async function checkRemovedFeatureAbsence(repositoryRoot = defaultRepositoryRoot) {
  const failures = []

  for (const relativePath of removedPaths) {
    if (await pathExists(path.join(repositoryRoot, relativePath))) {
      failures.push(`${relativePath} still exists`)
    }
  }

  const sourceFiles = (await Promise.all(
    sourceRoots.map(relativePath => collectTextFiles(repositoryRoot, relativePath)),
  )).flat()
  for (const relativePath of ['index.html', 'scripts/build-extension.mjs', 'vite.config.mjs']) {
    if (await pathExists(path.join(repositoryRoot, relativePath))) sourceFiles.push(relativePath)
  }

  for (const relativePath of sourceFiles) {
    // These retained surfaces intentionally delete legacy persisted keys during migration.
    const isSettingsMigration = relativePath === 'src/redux/reducers/compositions.js'
    const contents = await readFile(path.join(repositoryRoot, relativePath), 'utf8')

    for (const { label, pattern } of forbiddenSourcePatterns) {
      if (isSettingsMigration && /Rive|AVD|SMIL|Banner/.test(label)) continue
      if (pattern.test(contents)) failures.push(`${relativePath} contains removed ${label}`)
    }
  }

  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'))
  for (const dependencies of dependencySections(packageJson)) {
    for (const dependency of Object.keys(dependencies)) {
      if (removedDependencyNames.has(dependency.toLowerCase())) {
        failures.push(`package.json still declares removed dependency ${dependency}`)
      }
    }
  }

  const serverSource = await readFile(path.join(repositoryRoot, 'bundle/server/main.js'), 'utf8')
  const declaredRoutes = [...serverSource.matchAll(/['"]((?:GET|POST) \/[^'"]+)['"]\s*:/g)]
    .map(match => match[1])
    .sort()
  assertEqual(declaredRoutes, [
    'GET /ping',
    'POST /encode',
    'POST /getType',
    'POST /processImage',
    'POST /splitAnimation',
  ].sort(), 'Local server route inventory differs from the retained contract')

  if (failures.length) {
    throw new Error(`Removed feature verification failed:\n- ${failures.join('\n- ')}`)
  }
}

function rendererArrayDefinitions(contents, name) {
  const pattern = new RegExp(`var\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;`, 'g')
  return [...contents.matchAll(pattern)].map((match) => (
    [...match[1].matchAll(/rendererTypes\.([A-Z]+)/g)].map(renderer => renderer[1])
  ))
}

function astPropertyName(property) {
  if (!property || property.type !== 'Property') return null
  if (!property.computed && property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') return property.key.value
  return null
}

function rendererMemberName(node) {
  if (!node || node.type !== 'MemberExpression' || node.computed
    || node.object.type !== 'Identifier' || node.object.name !== 'rendererTypes'
    || node.property.type !== 'Identifier') return null
  return node.property.name
}

function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return
  visit(node)
  for (const [key, child] of Object.entries(node)) {
    if (key === 'range' || key === 'loc' || key === 'raw') continue
    if (Array.isArray(child)) child.forEach(item => walkAst(item, visit))
    else if (child && typeof child === 'object') walkAst(child, visit)
  }
}

export function extractRendererMessageContract(relativePath, contents, removedRenderers = []) {
  const ast = esprima.parseScript(contents)
  const rendererArrays = new Map()
  walkAst(ast, (node) => {
    if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier' || node.init?.type !== 'ArrayExpression') return
    const renderers = node.init.elements.map(rendererMemberName)
    if (renderers.length && renderers.every(Boolean)) rendererArrays.set(node.id.name, renderers)
  })

  const entries = []
  function resolveRenderers(node) {
    let renderers
    if (node.type === 'ArrayExpression') renderers = node.elements.map(rendererMemberName)
    else if (node.type === 'Identifier') renderers = rendererArrays.get(node.name)
    else if (node.type === 'LogicalExpression') {
      if (node.operator !== '||') {
        throw new Error(`${relativePath} contains an unsupported dynamic renderer expression`)
      }
      const fallback = resolveRenderers(node.right)
      if (!fallback) {
        throw new Error(`${relativePath} contains an unresolved dynamic renderer fallback`)
      }
      return {
        dynamicSource: escodegen.generate(node.left, { format: { compact: true } }),
        renderers: fallback.renderers,
      }
    } else if (node.type === 'MemberExpression') return null
    if (!renderers || !renderers.length || !renderers.every(Boolean)) {
      throw new Error(`${relativePath} contains an unresolved renderer membership`)
    }
    return {
      dynamicSource: null,
      renderers: renderers.filter(renderer => !removedRenderers.includes(renderer)),
    }
  }

  function visit(node, context = []) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'ObjectExpression') {
      const rendererProperty = node.properties.find(property => astPropertyName(property) === 'renderers')
      if (rendererProperty) {
        const rendererContract = resolveRenderers(rendererProperty.value)
        if (rendererContract) {
          if (!rendererContract.renderers.length) throw new Error(`${relativePath} contains an empty retained renderer membership`)
          entries.push({
            file: relativePath,
            ordinal: entries.length,
            context: context.join(' > '),
            message: escodegen.generate({
              type: 'ObjectExpression',
              properties: node.properties.filter(property => property !== rendererProperty),
            }, { format: { compact: true } }),
            dynamicSource: rendererContract.dynamicSource,
            renderers: rendererContract.renderers,
          })
        }
      }
      node.properties.forEach(property => visit(property, context))
      return
    }
    if (node.type === 'Property') {
      const name = astPropertyName(node)
      visit(node.value, name === null ? context : [...context, name])
      return
    }
    if (node.type === 'VariableDeclarator') {
      visit(node.init, node.id.type === 'Identifier' ? [...context, node.id.name] : context)
      return
    }
    if (node.type === 'FunctionDeclaration') {
      visit(node.body, node.id ? [...context, node.id.name] : context)
      return
    }
    if (node.type === 'ArrayExpression') {
      node.elements.forEach((element, index) => visit(element, [...context, `[${index}]`]))
      return
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'range' || key === 'loc' || key === 'raw') continue
      if (Array.isArray(child)) child.forEach(item => visit(item, context))
      else if (child && typeof child === 'object') visit(child, context)
    }
  }
  visit(ast)
  return entries
}

export async function checkRendererContract(repositoryRoot = defaultRepositoryRoot) {
  const reportsRoot = path.join(repositoryRoot, 'bundle/jsx/reports')
  const rendererTypesSource = await readFile(path.join(reportsRoot, 'rendererTypes.jsx'), 'utf8')
  const rendererTypeEntries = [...rendererTypesSource.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*:\s*['"]([^'"]+)['"]/gm)]
    .map(match => [match[1], match[2]])
  assertEqual(rendererTypeEntries, [
    ['BROWSER', 'browser'],
    ['IOS', 'ios'],
    ['ANDROID', 'android'],
  ], 'Renderer type definitions differ from the retained contract')

  const reportFiles = (await collectTextFiles(repositoryRoot, 'bundle/jsx/reports')).sort()
  const definitions = {
    allRetainedRenderers: [],
    onlyBrowserRenderers: [],
    defaultRenderers: [],
  }

  for (const relativePath of reportFiles) {
    const contents = await readFile(path.join(repositoryRoot, relativePath), 'utf8')
    if (/rendererTypes\.SKOTTIE|['"]skottie['"]/i.test(contents)) {
      throw new Error(`${relativePath} still references the Skottie renderer`)
    }
    if (/renderers\s*:\s*(?:\[\s*\]|null\b|undefined\b)/m.test(contents)) {
      throw new Error(`${relativePath} contains an empty or missing renderer membership`)
    }
    for (const name of Object.keys(definitions)) {
      definitions[name].push(...rendererArrayDefinitions(contents, name).map(value => ({ relativePath, value })))
    }
  }

  assertEqual(
    definitions.allRetainedRenderers.map(definition => definition.value),
    [['BROWSER', 'IOS', 'ANDROID']],
    'allRetainedRenderers definitions differ from the retained contract',
  )
  assertEqual(
    definitions.onlyBrowserRenderers.map(definition => definition.value),
    [['IOS', 'ANDROID'], ['IOS', 'ANDROID']],
    'onlyBrowserRenderers definitions differ from the retained contract',
  )
  assertEqual(
    definitions.defaultRenderers.map(definition => definition.value),
    [['BROWSER', 'IOS', 'ANDROID'], ['BROWSER', 'IOS', 'ANDROID']],
    'defaultRenderers definitions differ from the retained contract',
  )

  const semanticContract = JSON.parse(await readFile(
    path.join(repositoryRoot, 'release', 'retained-renderer-contract.json'),
    'utf8',
  ))
  if (semanticContract.schemaVersion !== 1
    || semanticContract.baselineCommit !== '2a2686484c3347939e781684674ec50a78f37c9b'
    || semanticContract.removedRenderer !== 'SKOTTIE'
    || !Number.isSafeInteger(semanticContract.messageCount)
    || !/^[0-9a-f]{64}$/.test(semanticContract.messagesSha256)) {
    throw new Error('Retained renderer semantic contract metadata is invalid')
  }
  const currentMessages = []
  for (const relativePath of reportFiles) {
    const contents = await readFile(path.join(repositoryRoot, relativePath), 'utf8')
    currentMessages.push(...extractRendererMessageContract(relativePath, contents))
  }
  const currentMessagesSha256 = createHash('sha256')
    .update(JSON.stringify(currentMessages))
    .digest('hex')
  if (currentMessages.length !== semanticContract.messageCount
    || currentMessagesSha256 !== semanticContract.messagesSha256) {
    throw new Error('Report messages or retained renderer memberships differ from the archived baseline')
  }
}

export async function verifyRemovedFeatures(repositoryRoot = defaultRepositoryRoot) {
  await checkRemovedFeatureAbsence(repositoryRoot)
  await checkRendererContract(repositoryRoot)
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath) {
  await verifyRemovedFeatures()
  console.log('Verified removed feature absence and retained renderer contracts.')
}
