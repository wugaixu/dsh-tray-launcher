/**
 * dsh-tray-launcher — host half. Registers a loopback-only
 * /api/dsh-tray-launcher/install route that writes the system-tray launcher
 * files (dsh-web-tray.ps1 + start-dsh-tray.vbs + icon) under
 * $DSH_HOME/tray-launcher/ and places a double-click desktop shortcut that
 * launches them hidden (no console window). Windows-only. The browser half
 * (./client) renders the settings card with the "create desktop icon" button.
 */

import z from 'schemastery'
import { DEFAULT_PROFILE, DEFAULT_URL, installTrayLauncher, resolveLauncherSpec } from './launcher.js'
import { TRAY_API } from './protocol.js'
import { isLoopbackRequest } from './loopback.js'
import { writeJson } from './http.js'

/** Stable cordis plugin name. */
export const name = 'tray-launcher'

/** Services required before the route can mount. */
export const inject = ['webServer']

/** Settings namespace the browser half edits (spelled here so the browser half can too). */
export const TRAY_LAUNCHER_SETTINGS_NAMESPACE = 'tray-launcher'

/** Plugin config, validated by the same-named schemastery schema. */
export const Config = z.object({
  /** Master switch; off by default. */
  enabled: z.boolean().default(false),
  /** Base URL of the dsh web GUI. */
  url: z.string().default(DEFAULT_URL),
  /** Profile started as `dsh --profile <profile> --no-open`. */
  profile: z.string().default(DEFAULT_PROFILE),
  /** Optional icon file (.ico) for the tray + desktop icon; empty uses the bundled icon. */
  iconPath: z.string().default(''),
})

/**
 * Mount the install route, gated on the composition entry config (and the
 * live settings value once the web settings surface is served).
 * @param ctx - host plugin context carrying webServer.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx, config) {
  let current = () => config ?? {}
  let disposeRoutes

  // Register (or drop) the route to match the current source, so re-registering
  // never throws on a duplicate-name registration.
  const sync = () => {
    if (disposeRoutes !== undefined) {
      disposeRoutes()
      disposeRoutes = undefined
    }
    const value = current()
    // Off unless the resolved config says otherwise.
    if ((value.enabled ?? false) === false) return
    disposeRoutes = ctx.effect(
      () => {
        const dispose = ctx.webServer.register({
          kind: 'exact',
          path: TRAY_API.install,
          handler: async (req, res) => {
            if (!isLoopbackRequest(req)) {
              writeJson(res, 403, { error: 'forbidden: loopback-only' })
              return
            }
            if ((req.method ?? 'GET') !== 'POST') {
              writeJson(res, 405, { error: `method not allowed: ${req.method}` })
              return
            }
            try {
              writeJson(res, 200, { result: await installTrayLauncher({ resolveSpec: () => resolveLauncherSpec(current()) }) })
            } catch (error) {
              writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
            }
          },
        })
        return () => dispose()
      },
      'tray-launcher: install route',
    )
  }

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, TRAY_LAUNCHER_SETTINGS_NAMESPACE, Config, config ?? {}, {
      setSource: (source) => {
        current = source
        sync()
      },
      onChange: sync,
    })
  })

  // Initial registration from the composition entry (covers deployments with
  // no settings service, whose installSection never fires its hooks).
  sync()
}
