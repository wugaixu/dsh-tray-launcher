# dsh-tray-launcher

System-tray launcher + desktop shortcut plugin for DSH Web: one click in the
Web GUI settings creates a desktop icon that starts `dsh web` **fully hidden**
(no console window, not even a flash) and keeps a whale icon in the Windows
notification area with an Open / Stop / Exit menu. Windows only.

## Features

- **Desktop icon** — `DSH-Web-Tray.lnk` targeting `wscript.exe` + a hidden vbs,
  so no console window ever appears.
- **System tray** — whale icon with a context menu:
  - Open Web UI (auto-attaches the one-time token URL)
  - Stop DSH Web service
  - Exit (closes the DSH browser tab(s), stops the server, removes the icon)
- **Settings card** — enable toggle, URL, profile, custom `.ico`, and a
  "Create desktop icon" button (idempotent; safe to re-run).
- **Loopback-only** install route, so a LAN-exposed `dsh web` never exposes the
  file-writing / shortcut-creating endpoint to remote browsers.

## Install

```sh
# from npm
dsh plugin --profile web add dsh-tray-launcher

# or straight from GitHub (no npm publish needed)
dsh plugin --profile web add github:<your-account>/dsh-tray-launcher
```

Restart `dsh web`, then open Settings → Plugins (Web UI group) → "System Tray
Launcher": enable the plugin, then click "Create desktop icon".

> The settings card registers into the community `web-ui.plugin.item` slot
> (`@linxin666/dsh-web-all` / `dsh-client-ui-web-ui-settings`) when present, and
> falls back to the official `settings.plugin.item` slot otherwise. If the
> official settings namespace allowlist omits it, edit `$DSH_HOME/settings.yaml`
> directly and restart.

## Config

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Master switch; gates the install route |
| `url` | `http://127.0.0.1:3080` | Web GUI URL the launcher waits for and opens |
| `profile` | `web` | Started as `dsh --profile <profile> --no-open` |
| `iconPath` | `` | Optional absolute `.ico` path; blank uses the bundled icon |

## Generated files

Under `$DSH_HOME/tray-launcher/`: `dsh-web-tray.ps1`, `start-dsh-tray.vbs`,
`install-shortcut.ps1`, the icon, and the server logs. The desktop shortcut is
`%USERPROFILE%\Desktop\DSH-Web-Tray.lnk` (OneDrive desktop is detected).

## How it works

`node.exe` and the dsh `lib/bin.js` are resolved at generation time
(`process.execPath` + `@deepseek-ai/dsh` resolution, preferring the
`%APPDATA%\npm` global), so the tray launch has no PATH dependency; it falls
back to the `dsh` command when the bin cannot be located.

## License

MIT. The bundled `DeepSeekHarness-WhaleGirl.ico` is a placeholder — confirm you
may redistribute it, or replace it via the `iconPath` setting / `assets/`.
