# dsh-tray-launcher

DSH Web 系统托盘启动器 + 桌面快捷方式插件：在 Web GUI 设置页一键创建桌面图标，双击后**无黑框**后台启动 `dsh web`，并在系统通知区显示鲸鱼托盘图标（打开 / 停止 / 退出）。Windows-only。

## 功能

- 桌面图标：生成 `DSH-Web-Tray.lnk`，指向 `wscript.exe` + 隐藏启动的 vbs，**全程无控制台窗口**（连闪现都没有）。
- 系统托盘：鲸鱼图标 + 右键菜单：
  - Open Web UI —— 打开 Web GUI（自动带上一次性 token）
  - Stop DSH Web service —— 停止 `dsh web` node 进程
  - Exit —— 关闭 DSH 浏览器标签页并停止服务、移除图标
- 设置卡片：启用开关、URL、profile、自定义 `.ico`，点「创建桌面图标」即可（可重复点，幂等覆盖）。
- 安全：安装路由**仅限 loopback**，局域网暴露的 `dsh web` 不会把这个写文件/建快捷方式的接口暴露给远端浏览器。

## 安装

```sh
# 从 npm
dsh plugin --profile web add dsh-tray-launcher

# 或从 GitHub（无需发布 npm）
dsh plugin --profile web add github:<你的账号>/dsh-tray-launcher
```

安装后**重启 `dsh web`**，打开 设置 → 插件配置（Web 插件组）→「系统托盘启动器」卡片：先开启「启用插件」，再点「创建桌面图标」。

> **本地开发安装（`link:` / `file:`）必须先在源码目录装依赖**：`dsh plugin add link:<路径>` 只是把源码目录符号链接进 profile，**不会**为源码目录安装它声明的 `dependencies`（本包依赖 `schemastery`）。若包目录没有 `node_modules`，host 从真实路径解析 `schemastery` 会报 `Cannot find package 'schemastery'` 导致插件加载失败。所以本地 link/file 安装前请在包目录先 `npm install`：
> ```sh
> cd <本包目录> && npm install
> dsh plugin --profile web add link:<本包绝对路径>
> ```
> **发布形态（npm registry / `github:` git 安装）不会遇到这个问题**：npm/pnpm 会正确安装并解析 `schemastery`。发布前可跑 `npm run verify` 自检。

> 说明：设置卡片默认注册到社区 Web UI 插件组的 `web-ui.plugin.item` 槽位（`@linxin666/dsh-web-all` / `dsh-client-ui-web-ui-settings` 提供）。纯官方 DSH 上会回退到官方 `settings.plugin.item` 槽位；若官方设置页的命名空间白名单未放行，也可直接编辑 `$DSH_HOME/settings.yaml` 手动配置后重启。

> **与 `@linxin666/dsh-desktop-launcher` 二选一**：社区的 desktop-launcher 也创建桌面图标（`DeepSeek-Harness.lnk`）并带「启动中」小窗；本插件创建 `DSH-Web-Tray.lnk` 并带系统托盘。两者可共存（图标文件名不同，互不覆盖），但只要一个启动入口时建议二选一。若想保留全家桶但只用本插件的托盘，可在 `profiles/web/cordis.patch.yml` 里对 `web-ui-desktop-launcher` 加 `disabled: true`。

## 配置

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `enabled` | `false` | 插件总开关；关闭时不挂载安装路由 |
| `url` | `http://127.0.0.1:3080` | 托盘启动器等待并打开的 Web GUI 地址 |
| `profile` | `web` | 以 `dsh --profile <profile> --no-open` 启动 |
| `iconPath` | 空 | 自定义 `.ico` 绝对路径；留空用内置鲸鱼图标 |

也可直接编辑 `$DSH_HOME/settings.yaml`：

```yaml
tray-launcher:
  enabled: true
  url: http://127.0.0.1:3080
  profile: web
  iconPath: ""
```

## 生成的文件

插件把启动器写到 `$DSH_HOME/tray-launcher/`：

```
tray-launcher/
├── dsh-web-tray.ps1           # 托盘脚本（隐藏启动 + 托盘图标 + 菜单）
├── start-dsh-tray.vbs         # 隐藏启动 dsh-web-tray.ps1 的 vbs 包装
├── install-shortcut.ps1       # 创建桌面 .lnk 的安装脚本
├── DeepSeekHarness-WhaleGirl.ico
├── dsh-web.out.log / dsh-web.err.log   # 服务日志
```

桌面快捷方式：`%USERPROFILE%\Desktop\DSH-Web-Tray.lnk`（OneDrive 桌面会被识别）。

## 手动卸载

1. 删除桌面 `DSH-Web-Tray.lnk`。
2. 删除 `$DSH_HOME/tray-launcher/`。
3. 停止服务：托盘图标 → Exit，或
   `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*@deepseek-ai\dsh\lib\bin.js*' -and $_.CommandLine -like '*--profile web*' } | Stop-Process -Force`
4. `dsh plugin --profile web remove dsh-tray-launcher`

## 工作原理

```
桌面 .lnk ──► wscript.exe ──► start-dsh-tray.vbs ──► (隐藏) powershell -Sta
                                                        └─► dsh-web-tray.ps1
                                                              ├─ Start-Process node dsh-bin --profile web --no-open (隐藏)
                                                              ├─ 等待 / 就绪后抓取 token URL 并打开浏览器
                                                              └─ 常驻托盘图标（打开/停止/退出）
```

`node.exe` 与 `dsh` 的 `lib/bin.js` 在**生成时**由插件探测并写死进脚本（`process.execPath` + `@deepseek-ai/dsh` 解析，优先 `%APPDATA%\npm` 全局），因此托盘启动不依赖 PATH；解析失败时回退到 `dsh` 命令。

## 与 @linxin666/dsh-desktop-launcher 的区别

社区已有 `@linxin666/dsh-desktop-launcher`（桌面图标 + 「启动中」小窗 + 悬浮关机按钮）。本插件的差异点是**系统托盘图标**（常驻、右键菜单打开/停止/退出），且桌面快捷方式走 `wscript` 双层隐藏，保证**零黑框闪现**。两者可共存。

## 发布到 GitHub / npm / 创意工坊

1. **GitHub**：本仓库就是标准单包结构，`git init` 后推到你的账号即可。
2. **npm**：改好 `package.json` 里的 `name`/`version`，`npm publish` 后即可 `dsh plugin add <name>`。`files` 已只发布 `lib / assets / cordis.patch.yml / README*`。
3. **创意工坊（dsh-market.com）**：向 [zhu1090093659/dsh-web](https://github.com/zhu1090093659/dsh-web) 的 `community.json`（`dsh-client-ui-community-plugins`）提 PR 加一条，或联系市场维护者上架。

## 目录结构

```
dsh-tray-launcher/
├── package.json          # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml      # 把插件插入 profile bundle 层
├── lib/
│   ├── index.js          # host：settings namespace + loopback 安装路由
│   ├── launcher.js       # 纯生成逻辑 + 快捷方式安装器（可测试）
│   ├── client.js         # 浏览器：设置卡片（工厂 CJS 格式）
│   ├── protocol.js       # 共享路由常量
│   ├── loopback.js       # loopback 信任栅栏
│   └── http.js           # JSON 响应
├── assets/
│   ├── dsh-web-tray.ps1  # 托盘脚本模板（{{占位符}}）
│   ├── start-dsh-tray.vbs
│   └── DeepSeekHarness-WhaleGirl.ico
├── smoke-test.mjs        # 开发自测（不发布）
└── README.md / README.zh.md
```

## 许可与图标

代码 MIT。`DeepSeekHarness-WhaleGirl.ico` 是占位图标，发布前请确认你对它有再分发权利，或换成自己的图标（设置项 `iconPath` 或替换 `assets/` 里的文件）。
