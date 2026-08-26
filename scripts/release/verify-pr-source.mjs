import {readFile, writeFile} from 'node:fs/promises'

const [pullRequestPath, repository, expectedNumber, expectedHead, outputPath] = process.argv.slice(2)

if (!outputPath) {
  throw new Error(
    'Usage: verify-pr-source.mjs <pull-request-json> <repository> <number> <head-sha> <github-output>',
  )
}

const pullRequest = JSON.parse(await readFile(pullRequestPath, 'utf8'))
const shaPattern = /^[0-9a-f]{40}$/
const number = `${pullRequest.number}`
const baseSha = pullRequest.base?.sha
const headSha = pullRequest.head?.sha

if (!/^[1-9][0-9]*$/.test(`${expectedNumber}`) || number !== `${expectedNumber}`) {
  throw new Error('Pull request number mismatch')
}
if (pullRequest.state !== 'open' || pullRequest.draft !== false) {
  throw new Error('The release pull request must be open and ready for review')
}
if (pullRequest.base?.repo?.full_name !== repository
  || pullRequest.base?.ref !== 'main'
  || pullRequest.head?.repo?.full_name !== repository
  || pullRequest.head?.ref !== 'develop') {
  throw new Error('Only a same-repository develop-to-main pull request may produce a release candidate')
}
if (!shaPattern.test(baseSha) || !shaPattern.test(headSha) || headSha !== expectedHead) {
  throw new Error('Pull request base or head SHA mismatch')
}

await writeFile(outputPath, `base_sha=${baseSha}\nhead_sha=${headSha}\npull_request_number=${number}\n`, {
  flag: 'a',
})
console.log(`Verified release pull request #${number}: ${baseSha} <- ${headSha}.`)
