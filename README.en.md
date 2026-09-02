# dsh-tray-launcher

> [English](README.en.md) | [中文](README.md)

> **DSH Web system-tray launcher + desktop-shortcut plugin** (Windows)

One click in the DSH Web GUI settings creates a desktop icon that starts `dsh web` **fully hidden** (no console window, not even a flash) and keeps a whale icon in the Windows notification area with an Open / Stop / Exit menu.

- Language: **English** (Chinese version: [README.md](README.md))
- Platform: **Windows** (the tray icon and desktop shortcut are Windows features)
- License: MIT

---

## Quick start

```sh
# from GitHub (recommended, no npm publish needed)
dsh plugin --profile web add github:wugaixu/dsh-tray-launcher

# after publishing to npm (optional)
dsh plugin --profile web add dsh-tray-launcher
```

**Restart `dsh web`**, then open **Settings → Plugins (Web UI group) → "System Tray Launcher"**: enable the plugin, then click "Create desktop icon". A `DSH-Web-Tray.lnk` appears on the desktop.

> Enabling is **hot-applied** (the install route mounts as soon as the setting changes), so you only need to restart once; later config changes need no restart.

---

## Features

- **Desktop icon** — `DSH-Web-Tray.lnk` targeting `wscript.exe` + a hidden vbs, so no console window ever appears.
- **System tray** — whale icon with a context menu:
  - Open Web UI (auto-attaches the one-time token URL)
  - Stop DSH Web service
  - Exit (closes the DSH browser tab(s), stops the server, removes the icon)
- **Settings card** — enable toggle, GUI URL, launch profile, custom `.ico`; "Create desktop icon" is idempotent (safe to re-run).
- **Loopback-only** install route, so a LAN-exposed `dsh web` never exposes the file-writing / shortcut-creating endpoint to remote browsers.

---

## Configuration

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Master switch; gates the install route |
| `url` | `http://127.0.0.1:3080` | Web GUI URL the launcher waits for and opens |
| `profile` | `web` | Started as `dsh --profile <profile> --no-open` |
| `iconPath` | `` | Optional absolute `.ico` path; blank uses the bundled whale icon |

Or edit `$DSH_HOME/settings.yaml` directly:

```yaml
tray-launcher:
  enabled: true
  url: http://127.0.0.1:3080
  profile: web
  iconPath: ""
```

---

## How it works

```
Desktop .lnk ──► wscript.exe ──► start-dsh-tray.vbs ──► (hidden) powershell -Sta
                                                            └─► dsh-web-tray.ps1
                                                                  ├─ Start-Process node dsh-bin --profile web --no-open (hidden)
                                                                  ├─ wait / grab the token URL and open the browser
                                                                  └─ persistent tray icon (Open / Stop / Exit)
```

`node.exe` and dsh's `lib/bin.js` are resolved **at generation time** by the plugin (`process.execPath` + `@deepseek-ai/dsh` resolution, preferring the `%APPDATA%\npm` global), so the tray launch has **no PATH dependency**; it falls back to the `dsh` command when the bin cannot be located.

---

## Generated files

The launcher is written to `$DSH_HOME/tray-launcher/`:

```
tray-launcher/
├── dsh-web-tray.ps1           # tray script (hidden launch + tray icon + menu)
├── start-dsh-tray.vbs         # vbs wrapper that launches dsh-web-tray.ps1 hidden
├── install-shortcut.ps1       # script that creates the desktop .lnk
├── DeepSeekHarness-WhaleGirl.ico
└── dsh-web.out.log / dsh-web.err.log   # server logs
```

Desktop shortcut: `%USERPROFILE%\Desktop\DSH-Web-Tray.lnk` (OneDrive desktop is detected).

---

## Notes

- **Windows-only**: installing on macOS / Linux errors clearly ("Windows only") and leaves nothing behind.
- **Local dev (`link:` / `file:`) installs need deps installed first**: `dsh plugin add link:<path>` only symlinks the source dir into the profile and does **not** install the `dependencies` it declares (this package depends on `schemastery`). Without a local `node_modules`, the host resolves `schemastery` from the real path and fails with `Cannot find package 'schemastery'`. So before a link/file install, run in the package dir:
  ```sh
  cd <pkg-dir> && npm install
  dsh plugin --profile web add link:<abs-path>
  ```
  **Publish form (npm registry / `github:` git install) is immune** — the package manager installs and resolves `schemastery`.
- **Pick one with `@linxin666/dsh-desktop-launcher`**: the community desktop-launcher also creates a desktop icon (`DeepSeek-Harness.lnk`) with a "starting…" popup; this plugin creates `DSH-Web-Tray.lnk` with a **system tray**. They can coexist (distinct file names, they don't overwrite each other), but prefer one entry point. To keep the family bundle but use only this plugin's tray, add `disabled: true` for `web-ui-desktop-launcher` in `profiles/web/cordis.patch.yml`.
- **Vainilla DSH without the card**: the settings card registers into the community `web-ui.plugin.item` slot (`@linxin666/dsh-web-all` / `dsh-client-ui-web-ui-settings`); if those are absent or the settings allowlist omits the namespace, edit `$DSH_HOME/settings.yaml` (above) and restart.

---

## Manual uninstall

1. Delete the desktop `DSH-Web-Tray.lnk`.
2. Delete `$DSH_HOME/tray-launcher/`.
3. Stop the service: tray icon → Exit, or
   `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*@deepseek-ai\dsh\lib\bin.js*' -and $_.CommandLine -like '*--profile web*' } | Stop-Process -Force`
4. `dsh plugin --profile web remove dsh-tray-launcher`

---

## Develop & release

```sh
npm run verify        # publish-form self-check: npm pack (files whitelist, drops node_modules)
                      #   → install into a clean temp dir → import host module → resolve deps
```

- Run `npm run verify` before publishing to confirm the packed artifact resolves `schemastery`/deps (the verify simulates the way a registry/git install works).
- Publish to the workshop: open a PR to [zhu1090093659/dsh-web](https://github.com/zhu1090093659/dsh-web)'s `community.json` (`packages/dsh-client-ui-community-plugins`) with `id / name / nameEn / author / description / descriptionEn / repo / npm / category / subcategory`.

---

## Repository layout

```
dsh-tray-launcher/
├── package.json          # dsh.bundle.patch + dsh.client declaration
├── cordis.patch.yml      # inserts the plugin into the profile bundle layer
├── lib/
│   ├── index.js          # host: settings namespace + loopback install route
│   ├── launcher.js       # pure generation + shortcut installer (testable)
│   ├── client.js         # browser: settings card (ModuleLoader factory form)
│   ├── protocol.js       # shared route constant
│   ├── loopback.js       # loopback trust fence
│   └── http.js           # JSON response
├── assets/
│   ├── dsh-web-tray.ps1  # tray script template ({{placeholders}})
│   ├── start-dsh-tray.vbs
│   └── DeepSeekHarness-WhaleGirl.ico
├── verify-release.mjs    # publish-form self-check (npm run verify)
└── README.md / README.en.md
```

---

## License & icon

Code is MIT. `DeepSeekHarness-WhaleGirl.ico` is a placeholder — confirm you may redistribute it, or replace it via the `iconPath` setting / `assets/`.

[English](README.en.md) | [中文](README.md)
