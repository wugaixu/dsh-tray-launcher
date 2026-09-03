/**
 * dsh-tray-launcher — host half. Registers loopback-only routes that write the
 * tray launcher files and control the running tray instance.
 */

import z from 'schemastery'
import {
  DEFAULT_PROFILE,
  DEFAULT_URL,
  installTrayLauncher,
  requestTrayExit,
  requestTrayRestart,
  resolveLauncherSpec,
} from './launcher.js'
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

function requireLoopbackPost(req, res) {
  if (!isLoopbackRequest(req)) {
    writeJson(res, 403, { error: 'forbidden: loopback-only' })
    return false
  }
  if ((req.method ?? 'GET') !== 'POST') {
    writeJson(res, 405, { error: `method not allowed: ${req.method}` })
    return false
  }
  return true
}

/**
 * Mount the host routes, gated on the composition entry config (and the live
 * settings value once the web settings surface is served).
 * @param ctx - host plugin context carrying webServer.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx, config) {
  let current = () => config ?? {}
  let disposeRoutes

  const sync = () => {
    if (disposeRoutes !== undefined) {
      disposeRoutes()
      disposeRoutes = undefined
    }
    const value = current()
    if ((value.enabled ?? false) === false) return
    disposeRoutes = ctx.effect(
      () => {
        const routes = [
          {
            path: TRAY_API.install,
            work: async () => installTrayLauncher({ resolveSpec: () => resolveLauncherSpec(current()) }),
          },
          {
            path: TRAY_API.exit,
            work: async () => requestTrayExit({ resolveSpec: () => resolveLauncherSpec(current()) }),
          },
          {
            path: TRAY_API.restart,
            work: async () => requestTrayRestart({ resolveSpec: () => resolveLauncherSpec(current()) }),
          },
        ]
        const disposers = routes.map(({ path, work }) => ctx.webServer.register({
          kind: 'exact',
          path,
          handler: async (req, res) => {
            if (!requireLoopbackPost(req, res)) return
            try {
              writeJson(res, 200, { result: await work() })
            } catch (error) {
              writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
            }
          },
        }))
        return () => {
          for (const dispose of disposers) dispose()
        }
      },
      'tray-launcher: host routes',
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

  sync()
}
