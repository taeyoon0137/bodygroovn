import {spawnSync} from 'node:child_process'

import {verifyToolchain} from './toolchain.mjs'

const {yarnPath} = verifyToolchain()
const result = spawnSync(process.execPath, [yarnPath, ...process.argv.slice(2)], {stdio: 'inherit'})
if (result.error) throw result.error
if (result.signal) throw new Error(`Yarn terminated with signal ${result.signal}`)
process.exitCode = result.status ?? 1
