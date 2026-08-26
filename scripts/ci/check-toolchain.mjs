import {verifyToolchain} from './toolchain.mjs'

const {actual, yarnSha256} = verifyToolchain()
console.log(`Verified mise ${actual.mise}, Node ${actual.node}, and Yarn ${actual.yarn} (${yarnSha256}).`)
