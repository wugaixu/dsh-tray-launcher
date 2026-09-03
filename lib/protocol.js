/**
 * Wire contract between the host half (lib/index.js) and the browser half
 * (lib/client.js). One path constant plus the result shape — imported by
 * both halves, no runtime identity to share.
 */

/** Route family of the tray-launcher host API. */
export const TRAY_API = {
  /** Generate the tray launcher files and place the desktop icon. */
  install: '/api/dsh-tray-launcher/install',
  /** Request the running tray instance to perform its Exit flow. */
  exit: '/api/dsh-tray-launcher/exit',
  /** Request the running tray instance to perform its Restart flow. */
  restart: '/api/dsh-tray-launcher/restart',
}
