// Smoke test for dsh-tray-launcher's generation logic. Runs the installer
// against temporary directories with a fake PowerShell runner, so it never
// touches the real Desktop or home directory and never spawns a process.
// Run: node smoke-test.mjs

import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  installTrayLauncher,
  resolveDshBin,
  resolveDshHome,
  psQuote,
} from './lib/launcher.js'

const root = await mkdtemp(join(tmpdir(), 'dsh-tray-smoke-'))
const homeDir = join(root, 'home')
const dshHomeDir = join(root, 'dshhome')
const desktopDir = join(root, 'desktop')

let installerInvocation = null
const run = async (file, args) => {
  installerInvocation = { file, args }
  return { code: 0, stderr: '' }
}

const result = await installTrayLauncher({
  resolveSpec: () => ({ url: 'http://127.0.0.1:3080', profile: 'web', iconPath: '' }),
  homeDir,
  dshHomeDir,
  desktopDir,
  run,
})

console.log('result:', JSON.stringify(result, null, 2))
console.log('installer invocation:', JSON.stringify(installerInvocation, null, 2))

const files = await readdir(join(dshHomeDir, 'tray-launcher'))
console.log('generated files:', files.join(', '))

const ps = await readFile(result.trayScript, 'utf8')
if (ps.includes('{{')) {
  throw new Error('unsubstituted placeholder remains in dsh-web-tray.ps1')
}
const vbs = await readFile(result.vbs, 'utf8')
if (vbs.includes('{{')) {
  throw new Error('unsubstituted placeholder remains in start-dsh-tray.vbs')
}
const installer = await readFile(join(dshHomeDir, 'tray-launcher', 'install-shortcut.ps1'), 'utf8')

console.log('\n--- dsh-web-tray.ps1 (first 20 lines) ---')
console.log(ps.split('\n').slice(0, 20).join('\n'))
console.log('\n--- install-shortcut.ps1 ---')
console.log(installer)
console.log('\n--- start-dsh-tray.vbs ---')
console.log(vbs)

console.log('\nresolveDshBin() =', resolveDshBin() || '(empty -> dsh on PATH fallback)')
console.log('resolveDshHome() =', resolveDshHome())
console.log('psQuote check:', psQuote("a'b") === "'a''b'" ? 'ok' : 'FAIL')

await rm(root, { recursive: true, force: true })
console.log('\nSMOKE TEST PASSED')
