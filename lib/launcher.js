/**
 * Pure launcher generation + the Windows shortcut installer for
 * dsh-tray-launcher. Everything that touches the filesystem or spawns a
 * process is here, behind injectable seams so the host plugin and smoke
 * tests share one implementation.
 */

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export const DEFAULT_URL = 'http://127.0.0.1:3080'
export const DEFAULT_PROFILE = 'web'
export const TRAY_DIR_NAME = 'tray-launcher'
export const DESKTOP_LNK_NAME = 'DSH-Web-Tray.lnk'
export const TRAY_SCRIPT_NAME = 'dsh-web-tray.ps1'
export const TRAY_VBS_NAME = 'start-dsh-tray.vbs'
export const INSTALLER_NAME = 'install-shortcut.ps1'
export const ICON_NAME = 'DeepSeekHarness-WhaleGirl.ico'

const execFileAsync = promisify(execFile)

/** Single-quote a value for PowerShell (embedded quotes are doubled). */
export function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

/** Resolve the DSH home directory: $DSH_HOME wins, else ~/.dsh. */
export function resolveDshHome(env = process.env, home = homedir()) {
  const raw = env.DSH_HOME
  if (raw !== undefined && raw.trim() !== '') {
    const trimmed = raw.trim()
    let expanded
    if (trimmed === '~') expanded = home
    else if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) expanded = join(home, trimmed.slice(2))
    else expanded = trimmed
    return isAbsolute(expanded) ? expanded : join(process.cwd(), expanded)
  }
  return join(home, '.dsh')
}

/** Desktop directory, with the Windows OneDrive redirect fallback. */
export function resolveDesktopDir(home = homedir()) {
  const desktop = join(home, 'Desktop')
  if (!existsSync(desktop)) {
    const onedrive = join(home, 'OneDrive', 'Desktop')
    if (existsSync(onedrive)) return onedrive
  }
  return desktop
}

/**
 * Resolve the dsh CLI entry (lib/bin.js): the standard Windows npm global
 * first, then whatever @deepseek-ai/dsh the running profile can see. Empty
 * string when neither resolves — the tray script then falls back to `dsh`
 * on PATH.
 */
export function resolveDshBin() {
  const candidates = []
  const appdata = process.env.APPDATA
  if (appdata) {
    candidates.push(join(appdata, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
  }
  try {
    const require = createRequire(import.meta.url)
    const pkg = require.resolve('@deepseek-ai/dsh/package.json')
    candidates.push(join(dirname(pkg), 'lib', 'bin.js'))
  } catch {
    /* @deepseek-ai/dsh not resolvable from this package */
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return ''
}

/** Absolute path of the icon bundled with the package, if present. */
export function bundledIconPath() {
  try {
    const path = fileURLToPath(new URL('../assets/' + ICON_NAME, import.meta.url))
    return existsSync(path) ? path : undefined
  } catch {
    return undefined
  }
}

/** Fill defaults from a partial config (schema defaults may be absent in tests). */
export function resolveLauncherSpec(config = {}) {
  return {
    url: config.url ?? DEFAULT_URL,
    profile: config.profile ?? DEFAULT_PROFILE,
    iconPath: config.iconPath ?? '',
  }
}

/** Render the PowerShell script that creates the Desktop .lnk. */
export function renderShortcutInstaller({ vbsPath, desktopPath, iconLocation, workingDirectory }) {
  const wscript = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'wscript.exe')
  return [
    '# DSH tray-launcher desktop shortcut installer (generated)',
    "$ErrorActionPreference = 'Stop'",
    '$ws = New-Object -ComObject WScript.Shell',
    `$shortcut = $ws.CreateShortcut(${psQuote(desktopPath)})`,
    `$shortcut.TargetPath = ${psQuote(wscript)}`,
    `$shortcut.Arguments = ${psQuote('"' + vbsPath + '"')}`,
    `$shortcut.WorkingDirectory = ${psQuote(workingDirectory)}`,
    `$shortcut.IconLocation = ${psQuote(iconLocation)}`,
    `$shortcut.Description = ${psQuote('DSH Web - system tray launcher')}`,
    '$shortcut.Save()',
    '',
  ].join('\n')
}

/** Default command runner: execFile with a 30s cap, reporting exit + stderr. */
const defaultRunner = async (file, args) => {
  try {
    await execFileAsync(file, args, { timeout: 30_000, windowsHide: true })
    return { code: 0, stderr: '' }
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : null
    return {
      code: typeof code === 'number' ? code : null,
      stderr: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Write the tray launcher files and place the desktop icon. Refreshing is
 * idempotent: rerunning overwrites every file. Windows-only.
 *
 * @param deps - spec resolver plus test seams (homeDir / dshHomeDir / desktopDir
 *   / platform / run / iconSource / dshBin / node).
 * @returns the desktop icon path and the generated file paths.
 */
export async function installTrayLauncher(deps) {
  const spec = deps.resolveSpec()
  const platform = deps.platform ?? process.platform
  if (platform !== 'win32') {
    throw new Error(
      `dsh-tray-launcher supports Windows only (current platform: ${platform}); ` +
      'the system tray icon and desktop shortcut are Windows features',
    )
  }
  const home = deps.homeDir ?? homedir()
  const run = deps.run ?? defaultRunner
  const scriptsDir = join(deps.dshHomeDir ?? resolveDshHome(), TRAY_DIR_NAME)
  await mkdir(scriptsDir, { recursive: true })

  const url = spec.url ?? DEFAULT_URL
  const profile = spec.profile ?? DEFAULT_PROFILE
  const node = deps.node ?? process.execPath
  const bin = deps.dshBin ?? resolveDshBin()

  const psTemplate = await readFile(new URL('../assets/dsh-web-tray.ps1', import.meta.url), 'utf8')
  const psBody = psTemplate
    .replaceAll('{{NODE}}', psQuote(node))
    .replaceAll('{{BIN}}', psQuote(bin))
    .replaceAll('{{URL}}', psQuote(url))
    .replaceAll('{{PROFILE}}', psQuote(profile))
  const trayPath = join(scriptsDir, TRAY_SCRIPT_NAME)
  // UTF-8 BOM: Windows PowerShell 5.1 misreads the English text without it.
  await writeFile(trayPath, '\uFEFF' + psBody)

  const vbsTemplate = await readFile(new URL('../assets/start-dsh-tray.vbs', import.meta.url), 'utf8')
  const vbsBody = vbsTemplate.replaceAll('{{TRAY_SCRIPT}}', trayPath)
  const vbsPath = join(scriptsDir, TRAY_VBS_NAME)
  await writeFile(vbsPath, vbsBody)

  const iconSource = deps.iconSource
    ?? (spec.iconPath && existsSync(spec.iconPath) ? spec.iconPath : bundledIconPath())
  const iconPath = join(scriptsDir, ICON_NAME)
  if (iconSource !== undefined) {
    await copyFile(iconSource, iconPath)
  }

  const desktopDir = deps.desktopDir ?? resolveDesktopDir(home)
  await mkdir(desktopDir, { recursive: true })
  const desktopPath = join(desktopDir, DESKTOP_LNK_NAME)

  const installerPath = join(scriptsDir, INSTALLER_NAME)
  const iconLocation = iconSource !== undefined
    ? iconPath
    : join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'shell32.dll') + ',0'
  await writeFile(installerPath, '\uFEFF' + renderShortcutInstaller({
    vbsPath,
    desktopPath,
    iconLocation,
    workingDirectory: scriptsDir,
  }))

  const result = await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installerPath])
  if (result.code !== 0) {
    throw new Error(`shortcut creation failed: ${result.stderr}`)
  }

  return {
    ok: true,
    path: desktopPath,
    platform,
    trayScript: trayPath,
    vbs: vbsPath,
    icon: iconSource !== undefined ? iconPath : undefined,
    node,
    bin: bin === '' ? undefined : bin,
  }
}
