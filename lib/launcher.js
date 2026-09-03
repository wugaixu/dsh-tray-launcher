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
export const CONTROL_FILE_NAME = 'tray-control.json'

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

/** Resolve the tray-launcher scripts directory. */
export function resolveTrayScriptsDir(dshHomeDir = resolveDshHome()) {
  return join(dshHomeDir, TRAY_DIR_NAME)
}

/** Resolve the generated tray-launcher file paths. */
export function resolveTrayPaths(dshHomeDir = resolveDshHome()) {
  const scriptsDir = resolveTrayScriptsDir(dshHomeDir)
  return {
    scriptsDir,
    trayScript: join(scriptsDir, TRAY_SCRIPT_NAME),
    vbs: join(scriptsDir, TRAY_VBS_NAME),
    installer: join(scriptsDir, INSTALLER_NAME),
    icon: join(scriptsDir, ICON_NAME),
    control: join(scriptsDir, CONTROL_FILE_NAME),
    outLog: join(scriptsDir, 'dsh-web.out.log'),
    errLog: join(scriptsDir, 'dsh-web.err.log'),
  }
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
    const { stdout } = await execFileAsync(file, args, { timeout: 30_000, windowsHide: true })
    return { code: 0, stderr: '', stdout }
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : null
    return {
      code: typeof code === 'number' ? code : null,
      stderr: error instanceof Error ? error.message : String(error),
      stdout: typeof error === 'object' && error !== null && 'stdout' in error ? error.stdout ?? '' : '',
    }
  }
}

async function runPowerShellJson(script, run = defaultRunner) {
  const result = await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script])
  if (result.code !== 0) {
    throw new Error(result.stderr || `PowerShell failed with code ${result.code}`)
  }
  const text = String(result.stdout ?? '').trim()
  if (text === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`PowerShell returned non-JSON output: ${text}`)
  }
}

function controlCommandScript({ profile, trayScriptPath }) {
  return [
    `$profileName = ${psQuote(profile)}`,
    `$trayScriptPath = ${psQuote(trayScriptPath)}`,
    "$dsh = @(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" |",
    "  Where-Object { $_.CommandLine -like '*@deepseek-ai\\dsh\\lib\\bin.js*' -and $_.CommandLine -like \"*--profile $profileName*\" } |",
    '  Select-Object -ExpandProperty ProcessId)',
    "$tray = @(Get-CimInstance Win32_Process |",
    "  Where-Object { $_.Name -match '^powershell(\\.exe)?$|^pwsh(\\.exe)?$' -and $_.CommandLine -like \"*$trayScriptPath*\" } |",
    '  Select-Object -ExpandProperty ProcessId)',
    '[pscustomobject]@{ dshPids = $dsh; trayPids = $tray } | ConvertTo-Json -Depth 4 -Compress',
  ].join('\n')
}

/** Inspect the running DSH/tray processes for one profile. */
export async function inspectTrayRuntime({ resolveSpec, dshHomeDir, run } = {}) {
  const spec = resolveSpec ? resolveSpec() : resolveLauncherSpec()
  const paths = resolveTrayPaths(dshHomeDir ?? resolveDshHome())
  return runPowerShellJson(controlCommandScript({ profile: spec.profile ?? DEFAULT_PROFILE, trayScriptPath: paths.trayScript }), run)
}

/** Write one control command for the running tray script. */
export async function writeTrayControlCommand(action, { dshHomeDir } = {}) {
  const paths = resolveTrayPaths(dshHomeDir ?? resolveDshHome())
  await mkdir(paths.scriptsDir, { recursive: true })
  await writeFile(paths.control, JSON.stringify({ action, requestedAt: new Date().toISOString() }) + '\n', 'utf8')
  return paths.control
}

/** Stop the DSH Web process for one profile. */
export async function stopDshWebProfile(profile, { run } = {}) {
  const script = [
    `$profileName = ${psQuote(profile)}`,
    "$targets = @(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" |",
    "  Where-Object { $_.CommandLine -like '*@deepseek-ai\\dsh\\lib\\bin.js*' -and $_.CommandLine -like \"*--profile $profileName*\" })",
    '$stopped = @() ',
    'foreach ($proc in $targets) { Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue; $stopped += $proc.ProcessId }',
    '[pscustomobject]@{ stoppedPids = $stopped } | ConvertTo-Json -Depth 4 -Compress',
  ].join('\n')
  return runPowerShellJson(script, run)
}

/** Start the generated tray launcher without recreating the desktop shortcut. */
export async function startTrayLauncher({ dshHomeDir, run } = {}) {
  const paths = resolveTrayPaths(dshHomeDir ?? resolveDshHome())
  if (!existsSync(paths.vbs)) {
    throw new Error(`tray launcher is not installed yet: missing ${paths.vbs}`)
  }
  const wscript = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'wscript.exe')
  const script = [
    `$wscript = ${psQuote(wscript)}`,
    `$vbs = ${psQuote(paths.vbs)}`,
    'if (-not (Test-Path $wscript)) { throw "missing wscript.exe" }',
    'if (-not (Test-Path $vbs)) { throw "missing tray launcher vbs" }',
    'Start-Process -FilePath $wscript -ArgumentList @(\'"\' + $vbs + \'"\') -WindowStyle Hidden | Out-Null',
    '[pscustomobject]@{ ok = $true; vbs = $vbs; wscript = $wscript } | ConvertTo-Json -Depth 4 -Compress',
  ].join('\n')
  return runPowerShellJson(script, run)
}

/** Ask the tray process to perform its Exit flow, with a direct stop fallback. */
export async function requestTrayExit({ resolveSpec, dshHomeDir, run } = {}) {
  const spec = resolveSpec ? resolveSpec() : resolveLauncherSpec()
  const runtime = await inspectTrayRuntime({ resolveSpec: () => spec, dshHomeDir, run })
  const profile = spec.profile ?? DEFAULT_PROFILE
  const control = await writeTrayControlCommand('exit', { dshHomeDir })
  if (Array.isArray(runtime.trayPids) && runtime.trayPids.length > 0) {
    return { ok: true, mode: 'tray-command', command: 'exit', control, profile, trayPids: runtime.trayPids }
  }
  const fallback = await stopDshWebProfile(profile, { run })
  return {
    ok: true,
    mode: 'fallback-stop',
    command: 'exit',
    control,
    profile,
    stoppedPids: fallback.stoppedPids ?? [],
    warning: 'tray process not detected; stopped dsh web directly',
  }
}

/** Ask the tray process to perform its Restart flow, with a direct stop/start fallback. */
export async function requestTrayRestart({ resolveSpec, dshHomeDir, run } = {}) {
  const spec = resolveSpec ? resolveSpec() : resolveLauncherSpec()
  const runtime = await inspectTrayRuntime({ resolveSpec: () => spec, dshHomeDir, run })
  const profile = spec.profile ?? DEFAULT_PROFILE
  const control = await writeTrayControlCommand('restart', { dshHomeDir })
  if (Array.isArray(runtime.trayPids) && runtime.trayPids.length > 0) {
    return { ok: true, mode: 'tray-command', command: 'restart', control, profile, trayPids: runtime.trayPids }
  }
  const stopped = await stopDshWebProfile(profile, { run })
  const started = await startTrayLauncher({ dshHomeDir, run })
  return {
    ok: true,
    mode: 'fallback-stop-start',
    command: 'restart',
    control,
    profile,
    stoppedPids: stopped.stoppedPids ?? [],
    started,
    warning: 'tray process not detected; restarted through direct stop + wscript fallback',
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
  const paths = resolveTrayPaths(deps.dshHomeDir ?? resolveDshHome())
  await mkdir(paths.scriptsDir, { recursive: true })

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
  await writeFile(paths.trayScript, '\uFEFF' + psBody)

  const vbsTemplate = await readFile(new URL('../assets/start-dsh-tray.vbs', import.meta.url), 'utf8')
  const vbsBody = vbsTemplate.replaceAll('{{TRAY_SCRIPT}}', paths.trayScript)
  await writeFile(paths.vbs, vbsBody)

  const iconSource = deps.iconSource
    ?? (spec.iconPath && existsSync(spec.iconPath) ? spec.iconPath : bundledIconPath())
  if (iconSource !== undefined) {
    await copyFile(iconSource, paths.icon)
  }

  const desktopDir = deps.desktopDir ?? resolveDesktopDir(home)
  await mkdir(desktopDir, { recursive: true })
  const desktopPath = join(desktopDir, DESKTOP_LNK_NAME)

  const iconLocation = iconSource !== undefined
    ? paths.icon
    : join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'shell32.dll') + ',0'
  await writeFile(paths.installer, '\uFEFF' + renderShortcutInstaller({
    vbsPath: paths.vbs,
    desktopPath,
    iconLocation,
    workingDirectory: paths.scriptsDir,
  }))

  const result = await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', paths.installer])
  if (result.code !== 0) {
    throw new Error(`shortcut creation failed: ${result.stderr}`)
  }

  return {
    ok: true,
    path: desktopPath,
    platform,
    trayScript: paths.trayScript,
    vbs: paths.vbs,
    icon: iconSource !== undefined ? paths.icon : undefined,
    control: paths.control,
    node,
    bin: bin === '' ? undefined : bin,
  }
}
