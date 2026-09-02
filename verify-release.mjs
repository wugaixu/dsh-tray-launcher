// verify-release.mjs — publish-form self-check for dsh-tray-launcher.
// Pack the package (files whitelist, node_modules excluded), install the
// tarball into a clean temp consumer (which resolves package dependencies and
// nests schemastery), then import the host module from the real path to prove
// dependency resolution works the way the DSH loader sees a registry/git
// install. Run before publishing: node verify-release.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const pkgRoot = process.cwd()
console.log('pkgRoot =', pkgRoot, '| package.json present =', existsSync(join(pkgRoot, 'package.json')))
const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
const stale = readdirSync(pkgRoot).filter((name) => name.endsWith('.tgz'))
for (const name of stale) rmSync(join(pkgRoot, name), { force: true })

const work = mkdtempSync(join(tmpdir(), 'dsh-tray-verify-'))
let tgz
try {
  // Pack the published artifact into the package dir (npm pack writes here).
  const packOut = execFileSync(process.execPath, [npmCli, 'pack'], { cwd: pkgRoot, encoding: 'utf8' }).trim()
  const tgzName = packOut.split('\n').pop()
  tgz = join(pkgRoot, tgzName)
  if (!existsSync(tgz)) throw new Error('npm pack produced no .tgz')

  // Install the tarball into a fresh consumer — npm resolves `dependencies`
  // and nests schemastery under the installed package.
  const consumer = join(work, 'consumer')
  execFileSync(process.execPath, [npmCli, 'install', '--prefix', consumer, tgz, '--no-audit', '--no-fund'], { cwd: work, stdio: 'inherit' })

  // Import the host module from the consumer's real path (no preserve-symlinks),
  // the way the DSH loader resolves a registry/git install.
  const modPath = join(consumer, 'node_modules', 'dsh-tray-launcher', 'lib', 'index.js')
  const mod = await import(pathToFileURL(modPath).href)
  const schemasteryNested = existsSync(join(consumer, 'node_modules', 'dsh-tray-launcher', 'node_modules', 'schemastery'))

  console.log('consumed host module:', mod.name, JSON.stringify(mod.inject), '| apply=', typeof mod.apply, '| Config=', typeof mod.Config)
  console.log('schemastery bundled under consumer package:', schemasteryNested)
  console.log('PUBLISH-FORM DEPENDENCY RESOLUTION OK')
} finally {
  if (tgz) rmSync(tgz, { force: true })
  rmSync(work, { recursive: true, force: true })
}
