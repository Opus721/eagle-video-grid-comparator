(() => {
  "use strict";

  const MIN_VIDEOS = 2;
  const MAX_VIDEOS = 4;
  const REFRESH_INTERVAL_MS = 300;
  const OPEN_ACK_POLL_MS = 80;
  const OPEN_ACK_TIMEOUT_MS = 1600;
  const OPEN_REQUEST_FILE_PREFIX = "eagle-video-grid-comparator";
  const EAGLE_INJECT_URL = "http://127.0.0.1:41595/api/script/inject";
  const DEFAULT_PLUGIN_ID = "3c8cd4a3-b779-4c25-9436-6f29963fcd34";
  const ui = {};
  let refreshTimer = 0;
  let refreshInFlight = false;
  let pluginId = DEFAULT_PLUGIN_ID;

  function cacheUi() {
    ui.button = document.querySelector("#compareButton");
    ui.label = document.querySelector("#compareLabel");
    ui.count = document.querySelector("#selectionCount");
  }

  async function initialize(plugin) {
    pluginId = normalizedPluginId(plugin);
    cacheUi();
    ui.button.addEventListener("click", openComparator);
    await applyTheme(window.eagle?.app?.theme);
    await refreshSelection();
    startSelectionWatch();
  }

  async function getSelectedItems() {
    if (window.eagle?.item?.getSelected) return window.eagle.item.getSelected();
    if (Array.isArray(window.__VIDEO_GRID_PREVIEW_ITEMS__)) return window.__VIDEO_GRID_PREVIEW_ITEMS__;
    return [];
  }

  async function getSelectedCount() {
    if (window.eagle?.item?.countSelected) return window.eagle.item.countSelected();
    return (await getSelectedItems()).length;
  }

  function validateCount(count) {
    return Number.isInteger(count) && count >= MIN_VIDEOS && count <= MAX_VIDEOS;
  }

  function normalizedPluginId(plugin) {
    return String(
      plugin?.manifest?.id ||
      window.eagle?.plugin?.manifest?.id ||
      DEFAULT_PLUGIN_ID
    ).replace(/[^a-z0-9_-]/gi, "_");
  }

  function nodeRequire(name) {
    const loader = typeof window.require === "function"
      ? window.require
      : (typeof require === "function" ? require : null);
    if (!loader) return null;
    try { return loader(name); }
    catch {
      try { return loader(`node:${name}`); }
      catch { return null; }
    }
  }

  // Eagle has no plugin API for opening a window plugin from an inspector, so
  // the button asks the local Eagle app (loopback only) to open this plugin.
  async function postInject(script) {
    if (typeof fetch === "function") {
      try {
        const response = await fetch(EAGLE_INJECT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      } catch (error) {
        if (!nodeRequire("http")) throw error;
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const http = nodeRequire("http");
        const BufferCtor = nodeRequire("buffer")?.Buffer || window.Buffer;
        if (!http || !BufferCtor) throw new Error("Eagle's local HTTP bridge is unavailable.");
        const body = JSON.stringify({ script });
        const request = http.request({
          hostname: "127.0.0.1",
          port: 41595,
          path: "/api/script/inject",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": BufferCtor.byteLength(body)
          }
        }, (response) => {
          let data = "";
          response.on("data", (chunk) => { data += chunk; });
          response.on("end", () => response.statusCode >= 200 && response.statusCode < 300
            ? resolve(data)
            : reject(new Error(`HTTP ${response.statusCode}`)));
        });
        request.on("error", reject);
        request.end(body);
      } catch (error) {
        reject(error);
      }
    });
  }

  function openComparatorViaEagle() {
    const script = `pluginModule.openPluginById(${JSON.stringify(pluginId)}, {});`;
    return postInject(script);
  }

  // Fallback for an already created comparator window: it polls this request
  // file in the OS temp directory and acknowledges it.
  function createOpenRequestBridge() {
    if (typeof require !== "function") return null;

    try {
      const fs = require("fs");
      const os = require("os");
      const path = require("path");
      const filePath = path.join(os.tmpdir(), `${OPEN_REQUEST_FILE_PREFIX}-${pluginId}.json`);
      return {
        read() {
          try {
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
          } catch {
            return null;
          }
        },
        write(request) {
          fs.writeFileSync(filePath, JSON.stringify(request), "utf8");
        }
      };
    } catch {
      return null;
    }
  }

  function sendOpenRequest() {
    const bridge = createOpenRequestBridge();
    if (!bridge?.write) return false;
    const createdAt = Date.now();
    const requestId = `${createdAt}-${Math.random().toString(36).slice(2)}`;
    bridge.write({ requestId, createdAt });
    return { bridge, requestId };
  }

  function waitForOpenAcknowledgement(bridge, requestId) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        const response = bridge?.read?.();
        if (String(response?.requestId || "") === requestId && response?.handledAt) {
          resolve(Boolean(response.opened));
          return;
        }
        if (Date.now() - startedAt >= OPEN_ACK_TIMEOUT_MS) {
          resolve(false);
          return;
        }
        window.setTimeout(check, OPEN_ACK_POLL_MS);
      };
      check();
    });
  }

  async function refreshSelection() {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      const count = await getSelectedCount();
      const valid = validateCount(count);
      ui.button.disabled = !valid;
      ui.label.textContent = valid ? "Compare" : "Select 2–4 videos";
      ui.count.textContent = valid ? String(count) : "2–4";
      ui.button.title = valid ? `Compare ${count} selected videos` : "Select 2–4 video items in Eagle";
    } catch {
      ui.button.disabled = true;
      ui.label.textContent = "Select 2–4 videos";
      ui.count.textContent = "2–4";
    } finally {
      refreshInFlight = false;
    }
  }

  async function openComparator() {
    const count = await getSelectedCount();
    if (!validateCount(count)) {
      await refreshSelection();
      return;
    }

    ui.button.disabled = true;
    ui.label.textContent = "Opening…";
    let refreshDelay = 450;
    try {
      try {
        await openComparatorViaEagle();
      } catch (directOpenError) {
        const request = sendOpenRequest();
        if (!request?.requestId) throw directOpenError;
        const opened = await waitForOpenAcknowledgement(request.bridge, request.requestId);
        if (!opened) throw directOpenError;
      }
    } catch {
      ui.label.textContent = "Could not open";
      refreshDelay = 1800;
    } finally {
      window.setTimeout(refreshSelection, refreshDelay);
    }
  }

  function startSelectionWatch() {
    stopSelectionWatch();
    refreshSelection();
    refreshTimer = window.setInterval(refreshSelection, REFRESH_INTERVAL_MS);
  }

  function stopSelectionWatch() {
    window.clearInterval(refreshTimer);
    refreshTimer = 0;
  }

  async function applyTheme(theme) {
    document.body.setAttribute("theme", String(await theme || "DARK").toUpperCase());
  }

  function registerLifecycle() {
    if (window.eagle && typeof window.eagle.onPluginCreate === "function") {
      window.eagle.onPluginCreate(initialize);
      window.eagle.onPluginShow(startSelectionWatch);
      window.eagle.onPluginHide(stopSelectionWatch);
      window.eagle.onPluginBeforeExit(stopSelectionWatch);
      window.eagle.onThemeChanged(applyTheme);
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
      initialize();
    }
  }

  registerLifecycle();
})();
