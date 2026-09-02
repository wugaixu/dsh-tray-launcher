// dsh-tray-launcher — browser half, in the lazy-CJS factory format the DSH
// client module system loads (see @deepseek-ai/dsh-client-modules). Registers
// the settings card over the `tray-launcher` namespace with the "create desktop
// icon" action. `react` and `@deepseek-ai/dsh-client-store` are platform seed
// words provided by the host shell, resolved here via require().
window.__ModuleLoader__.load({
  id: "dsh-tray-launcher",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const { createElement: h, useEffect, useState } = require("react");
    const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");

    /** Route path the host half registers (mirrors lib/protocol.js). */
    const TRAY_API_INSTALL = "/api/dsh-tray-launcher/install";

    /** Services required before the card can mount. */
    const inject = ["slots", "locale", "settingsScope"];

    const NS = "tray-launcher";
    const SETTINGS_NS = "tray-launcher";

    const en = {
      title: "System Tray Launcher",
      description: "Create a desktop icon that starts dsh web hidden and shows a system-tray icon (Open / Stop / Exit). Windows only.",
      enabled: "Enable plugin",
      enabledHint: "Turns on the host install route. Must be on before the desktop icon can be created.",
      url: "Web GUI URL",
      urlHint: "Base URL the tray launcher waits for and opens.",
      profile: "Profile",
      profileHint: "Started as `dsh --profile <profile> --no-open`.",
      iconPath: "Icon (.ico)",
      iconPathHint: "Optional absolute path of a .ico file; blank uses the bundled whale icon.",
      create: "Create desktop icon",
      creating: "Creating\u2026",
      created: "Created",
      createFailed: "Failed",
      requireEnabled: "Enable the plugin first.",
      warning: "Warning",
      notExposed: "This DSH version does not expose the tray-launcher settings namespace to the configuration page. Edit $DSH_HOME/settings.yaml directly, or confirm the plugin owning the namespace is mounted with its settings domain and restart.",
    };

    const zh = {
      title: "系统托盘启动器",
      description: "在桌面创建图标：双击后以隐藏窗口启动 dsh web，并在系统托盘显示鲸鱼图标（打开 / 停止 / 退出）。仅 Windows。",
      enabled: "启用插件",
      enabledHint: "打开宿主安装路由。必须先启用，才能创建桌面图标。",
      url: "Web GUI 地址",
      urlHint: "托盘启动器等待并打开的地址。",
      profile: "Profile",
      profileHint: "以 `dsh --profile <profile> --no-open` 启动。",
      iconPath: "图标 (.ico)",
      iconPathHint: "可选，.ico 文件的绝对路径；留空使用内置鲸鱼图标。",
      create: "创建桌面图标",
      creating: "创建中\u2026",
      created: "已创建",
      createFailed: "创建失败",
      requireEnabled: "请先启用插件。",
      warning: "提示",
      notExposed: "当前 DSH 版本未向设置页暴露 tray-launcher 配置命名空间，表单不可用。可直接编辑 $DSH_HOME/settings.yaml 配置，或确认拥有该命名空间的插件已挂载其设置域并重启。",
    };

    /** Bridges the `tray-launcher` settings scope onto a reactive card snapshot. */
    class TrayLauncherController {
      constructor(scope) {
        this.scope = scope;
        this.store = createSnapshotStore(this.projection());
        scope.subscribe(() => { this.store.set(this.projection()); });
      }

      projection() {
        const snap = this.scope.getSnapshot();
        const value = snap.status === "ready" ? (snap.value ?? {}) : {};
        return {
          available: snap.status !== "loading",
          exposed: snap.status === "ready",
          writable: snap.writable,
          enabled: value.enabled ?? false,
          url: value.url ?? "http://127.0.0.1:3080",
          profile: value.profile ?? "web",
          iconPath: value.iconPath ?? "",
        };
      }

      inject() {
        return {
          hooks: { trayCard: this.store },
          setEnabled: (value) => this.scope.mutate([{ op: "set", path: ["enabled"], value }]),
          setField: (field, value) => this.scope.mutate([{ op: "set", path: [field], value }]),
        };
      }
    }

    const styles = {
      card: {
        listStyle: "none",
        border: "0.5px solid var(--dsw-alias-border-l2)",
        borderRadius: "8px",
        padding: "12px 14px",
        background: "var(--dsw-alias-bg-layer-2)",
        color: "var(--dsw-alias-label-primary)",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        maxWidth: "760px",
      },
      title: { margin: 0, fontSize: "15px", fontWeight: 600 },
      desc: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-tertiary)" },
      row: { display: "flex", flexDirection: "column", gap: "4px" },
      toggleRow: { display: "flex", alignItems: "center", gap: "8px" },
      label: { fontSize: "13px" },
      hint: { margin: 0, fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" },
      input: {
        background: "var(--dsw-alias-bg-layer-3)",
        border: "0.5px solid var(--dsw-alias-border-l3)",
        borderRadius: "6px",
        color: "var(--dsw-alias-label-primary)",
        padding: "6px 8px",
        fontSize: "13px",
      },
      button: {
        alignSelf: "flex-start",
        background: "var(--dsw-alias-brand-primary)",
        color: "#fff",
        border: "none",
        borderRadius: "6px",
        padding: "7px 14px",
        fontSize: "13px",
        cursor: "pointer",
      },
      buttonDisabled: { opacity: 0.5, cursor: "not-allowed" },
      ok: { margin: 0, fontSize: "12px", color: "var(--dsw-alias-state-success, #22c55e)" },
      error: { margin: 0, fontSize: "12px", color: "var(--dsw-alias-label-error)" },
      notExposed: { margin: 0, fontSize: "13px", color: "var(--dsw-alias-label-tertiary)" },
    };

    /** Render the tray-launcher settings card. */
    function TrayLauncherSettingsCard(props) {
      const { t } = props;
      const state = props.useTrayCard((snapshot) => snapshot);
      const [draft, setDraft] = useState({ url: "", profile: "", iconPath: "" });
      const [creating, setCreating] = useState(false);
      const [created, setCreated] = useState(undefined);
      const [error, setError] = useState(undefined);

      useEffect(() => {
        setDraft({ url: state.url ?? "", profile: state.profile ?? "", iconPath: state.iconPath ?? "" });
      }, [state.url, state.profile, state.iconPath]);

      if (!state.available) return null;

      if (!state.exposed) {
        return h("li", { style: styles.card },
          h("div", { style: styles.title }, t("title")),
          h("p", { style: styles.notExposed }, t("notExposed")));
      }

      const create = async () => {
        setCreating(true);
        setError(undefined);
        setCreated(undefined);
        try {
          const response = await fetch(TRAY_API_INSTALL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          });
          const body = await response.json().catch(() => undefined);
          if (!response.ok) {
            const message = body && typeof body.error === "string" ? body.error : "HTTP " + response.status;
            throw new Error(message);
          }
          setCreated(body.result);
        } catch (createError) {
          setError(createError instanceof Error ? createError.message : String(createError));
        } finally {
          setCreating(false);
        }
      };

      const input = (field, labelKey, hintKey, placeholder) => h("div", { style: styles.row },
        h("label", { style: styles.label }, t(labelKey)),
        h("input", {
          type: "text",
          style: styles.input,
          value: draft[field],
          placeholder,
          disabled: !state.writable,
          onChange: (event) => { setDraft((prev) => ({ ...prev, [field]: event.target.value })); },
          onBlur: () => { if (draft[field] !== state[field]) props.setField(field, draft[field]); },
        }),
        h("p", { style: styles.hint }, t(hintKey)));

      return h("li", { style: styles.card },
        h("div", { style: styles.title }, t("title")),
        h("p", { style: styles.desc }, t("description")),
        h("div", { style: styles.toggleRow },
          h("input", {
            type: "checkbox",
            checked: state.enabled,
            disabled: !state.writable,
            onChange: (event) => { props.setEnabled(event.target.checked); },
          }),
          h("label", { style: styles.label }, t("enabled"))),
        h("p", { style: styles.hint }, t("enabledHint")),
        input("url", "url", "urlHint", "http://127.0.0.1:3080"),
        input("profile", "profile", "profileHint", "web"),
        input("iconPath", "iconPath", "iconPathHint", ""),
        h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
          h("button", {
            type: "button",
            style: { ...styles.button, ...(creating || !state.writable || !state.enabled ? styles.buttonDisabled : {}) },
            disabled: creating || !state.writable || !state.enabled,
            onClick: () => { void create(); },
          }, t(creating ? "creating" : "create")),
          !state.enabled ? h("p", { style: styles.hint }, t("requireEnabled")) : null,
          created ? h("p", { style: styles.ok }, t("created") + ": " + created.path + (created.warning ? " (" + t("warning") + ": " + created.warning + ")" : "")) : null,
          error ? h("p", { style: styles.error }, t("createFailed") + ": " + error) : null));
    }

    function apply(ctx) {
      ctx.effect(() => {
        try {
          return ctx.locale.register(NS, { zh, en });
        } catch {
          return () => {};
        }
      }, "tray-launcher: dictionaries");

      // Prefer the community Web UI settings binder when the group plugin is
      // installed; otherwise use the official settings scope.
      const community = ctx.get("webUiSettings") !== undefined;
      const binder = community ? ctx.get("webUiSettings") : ctx.settingsScope;
      const scope = binder.bind({ namespace: SETTINGS_NS });
      const controller = new TrayLauncherController(scope);

      const slotName = community ? "web-ui.plugin.item" : "settings.plugin.item";
      ctx.slots.inject(slotName, () => {
        try {
          const registration = {
            name: slotName,
            locale: NS,
            inject: () => controller.inject(),
          };
          if (community) {
            registration.id = "tray-launcher";
            registration.order = 140;
          } else {
            registration.key = SETTINGS_NS;
          }
          return ctx.slots.register(registration, TrayLauncherSettingsCard);
        } catch {
          return () => {};
        }
      });
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
