# dsh-tray-launcher

> [English](README.en.md) | [中文](README.md)

> **DSH Web 系统托盘启动器 + 桌面快捷方式插件**（Windows）

在 DSH Web GUI 设置页**一键创建桌面图标**：双击后**无黑框**后台启动 `dsh web`，并在系统通知区常驻一个鲸鱼托盘图标（打开 / 停止 / 退出）。

- 语言：**中文**（英文版见 [README.en.md](README.en.md)）
- 平台：**Windows**（托盘图标与桌面快捷方式是 Windows 特性）
- 许可：MIT

---

## 快速开始

```sh
# 从 GitHub（推荐，无需 npm）
dsh plugin --profile web add github:wugaixu/dsh-tray-launcher

# 发布到 npm 后（可选）
dsh plugin --profile web add dsh-tray-launcher
```

**重启 `dsh web`**，然后打开 **设置 → 插件配置（Web 插件组）→「系统托盘启动器」**：勾选「启用插件」，点「创建桌面图标」。桌面随即出现 `DSH-Web-Tray.lnk`。

> 启用是**热生效**的（改设置会立刻挂载安装路由），只需重启这一次，之后调配置不用再重启。

---

## 功能

- **桌面图标**：生成 `DSH-Web-Tray.lnk`，指向 `wscript.exe` + 隐藏启动的 vbs，**全程无控制台窗口**（连闪现都没有）。
- **系统托盘**：鲸鱼图标 + 右键菜单
  - Open Web UI —— 打开 Web GUI（自动带上一次性 token）
  - Restart DSH Web service —— 执行托盘内建重启流程（Exit 后自动自启）
  - Stop DSH Web service —— 停止 `dsh web` node 进程
  - Exit —— 关闭 DSH 浏览器标签页、停止服务、移除图标
- **设置卡片**：启用开关、GUI URL、启动 profile、自定义 `.ico`；点「创建桌面图标」即可（幂等，可重复点）。
- **安全**：控制/安装路由**仅限 loopback**——局域网暴露的 `dsh web` 不会把这些写文件或控制托盘的接口暴露给远端浏览器。
- **可调用控制接口**：新增 `exit` / `restart` 路由，可从本机直接请求托盘实例执行等效于菜单 `Exit` 的关闭流程，或执行“退出后再自启”的重启流程。

---

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

---

## 工作原理

```
桌面 .lnk ──► wscript.exe ──► start-dsh-tray.vbs ──► (隐藏) powershell -Sta
                                                        └─► dsh-web-tray.ps1
                                                              ├─ Start-Process node dsh-bin --profile web --no-open (隐藏)
                                                              ├─ 等待 / 就绪后抓取 token URL 并打开浏览器
                                                              └─ 常驻托盘图标（打开 / 停止 / 退出）
```

`node.exe` 与 dsh 的 `lib/bin.js` 在**生成时**由插件探测并写死进脚本（`process.execPath` + `@deepseek-ai/dsh` 解析，优先 `%APPDATA%\npm` 全局），因此托盘启动**不依赖 PATH**；解析失败时回退到 `dsh` 命令。

---

## 生成的文件

插件把启动器写到 `$DSH_HOME/tray-launcher/`：

```
tray-launcher/
├── dsh-web-tray.ps1           # 托盘脚本（隐藏启动 + 托盘图标 + 菜单）
├── start-dsh-tray.vbs         # 隐藏启动 dsh-web-tray.ps1 的 vbs 包装
├── install-shortcut.ps1       # 创建桌面 .lnk 的安装脚本
├── DeepSeekHarness-WhaleGirl.ico
├── tray-control.json          # host 写入的托盘控制命令（exit / restart）
└── dsh-web.out.log / dsh-web.err.log   # 服务日志
```

桌面快捷方式：`%USERPROFILE%\Desktop\DSH-Web-Tray.lnk`（OneDrive 桌面会被识别）。

## 控制接口

所有控制接口都要求：

- 仅 `POST`
- 仅 loopback 本机请求
- 不创建新的桌面快捷方式

接口：

- `POST /api/dsh-tray-launcher/install`
  - 生成/刷新托盘脚本、vbs、图标，并创建桌面快捷方式
- `POST /api/dsh-tray-launcher/exit`
  - 请求正在运行的托盘实例执行与菜单 `Exit` 等效的流程
  - 若托盘实例不在，则回退为直接停止对应 profile 的 `dsh web`
- `POST /api/dsh-tray-launcher/restart`
  - 请求正在运行的托盘实例执行“Exit 后再自启”
  - 若托盘实例不在，则回退为直接停止 `dsh web`，然后执行 `wscript.exe + start-dsh-tray.vbs`

`restart` 路由只负责重启，不会调用 `install-shortcut.ps1`，因此不会新建桌面快捷方式。

---

## 注意事项

- **Windows-only**：`macOS / Linux` 上安装会明确报“仅支持 Windows”，不产生残留。
- **本地开发（`link:` / `file:`）安装需先装依赖**：`dsh plugin add link:<路径>` 只把源码目录**符号链接**进 profile，**不会**为源码目录安装它声明的 `dependencies`（本包依赖 `schemastery`）。若包目录没有 `node_modules`，host 从真实路径解析 `schemastery` 会报 `Cannot find package 'schemastery'` 导致插件加载失败。所以本地开发安装前请先：
  ```sh
  cd <本包目录> && npm install
  dsh plugin --profile web add link:<本包绝对路径>
  ```
  **发布形态（npm registry / `github:` git 安装）不会遇到该问题**——npm/pnpm 会自动安装并解析 `schemastery`。
- **与 `@linxin666/dsh-desktop-launcher` 二选一**：社区的 desktop-launcher 也创建桌面图标（`DeepSeek-Harness.lnk`）并带「启动中」小窗；本插件创建 `DSH-Web-Tray.lnk` 并带**系统托盘**。两者图标文件名不同、可共存，但只要一个启动入口时建议二选一。若保留全家桶但只用本插件的托盘，可在 `profiles/web/cordis.patch.yml` 里对 `web-ui-desktop-launcher` 加 `disabled: true`。
- **纯官方 DSH 的无卡片场景**：设置卡片默认注册到社区 Web UI 插件组的 `web-ui.plugin.item` 槽位（`@linxin666/dsh-web-all` / `dsh-client-ui-web-ui-settings` 提供）。若你的环境没有该插件组或设置页白名单未放行命名空间，可直接编辑 `$DSH_HOME/settings.yaml` 配置（见上文），重启即可。

---

## 手动卸载

1. 删除桌面 `DSH-Web-Tray.lnk`。
2. 删除 `$DSH_HOME/tray-launcher/`。
3. 停止服务：托盘图标 → Exit，或
   `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*@deepseek-ai\dsh\lib\bin.js*' -and $_.CommandLine -like '*--profile web*' } | Stop-Process -Force`
4. `dsh plugin --profile web remove dsh-tray-launcher`

---

## 开发与发布

```sh
npm run verify        # 发布形态自检：npm pack（files 白名单，剔除 node_modules）
                      #   → 装进干净临时目录 → import host 模块 → 验证依赖解析
```

- 发布前请先跑 `npm run verify`，确认打包产物能正确解析 `schemastery` 等依赖（发布到 npm / GitHub 时由包管理器自动安装，`verify` 模拟的正是这种形态）。
- 上架创意工坊：向 [zhu1090093659/dsh-web](https://github.com/zhu1090093659/dsh-web) 的 `community.json`（`packages/dsh-client-ui-community-plugins`）提 PR 加一条，字段 `id / name / nameEn / author / description / descriptionEn / repo / npm / category / subcategory`。

---

## 目录结构

```
dsh-tray-launcher/
├── package.json          # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml      # 把插件插入 profile bundle 层
├── lib/
│   ├── index.js          # host：settings namespace + loopback 安装路由
│   ├── launcher.js       # 纯生成逻辑 + 快捷方式安装器（可测试）
│   ├── client.js         # 浏览器：设置卡片（ModuleLoader 工厂格式）
│   ├── protocol.js       # 共享路由常量
│   ├── loopback.js       # loopback 信任栅栏
│   └── http.js           # JSON 响应
├── assets/
│   ├── dsh-web-tray.ps1  # 托盘脚本模板（{{占位符}}）
│   ├── start-dsh-tray.vbs
│   └── DeepSeekHarness-WhaleGirl.ico
├── verify-release.mjs    # 发布形态自检（npm run verify）
└── README.md / README.en.md
```

---

## 许可与图标

代码 MIT。`DeepSeekHarness-WhaleGirl.ico` 为占位图标，请确认你对它有再分发权利，或替换为自己的图标（设置项 `iconPath` 或直接替换 `assets/` 里的文件）。

[English](README.en.md) | [中文](README.md)
