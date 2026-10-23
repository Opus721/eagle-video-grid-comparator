(() => {
  "use strict";

  const VIDEO_EXTENSIONS = new Set([
    "mp4", "mov", "m4v", "webm", "mkv", "avi", "wmv", "mpg", "mpeg", "m2ts", "ts"
  ]);
  const MIN_VIDEOS = 2;
  const MAX_VIDEOS = 4;
  const DRIFT_LIMIT_SECONDS = 0.08;
  const CORRECTION_INTERVAL_MS = 180;
  const SCRUB_SEEK_INTERVAL_MS = 120;
  const SEEK_SETTLE_TIMEOUT_MS = 900;
  const SEEK_TARGET_EPSILON = 0.015;
  const END_EPSILON = 0.025;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 6;
  const WHEEL_ZOOM_SENSITIVITY = 0.002;
  const DRAG_THRESHOLD_PX = 4;
  const WINDOW_HEIGHT_RATIO = 0.7;
  const OPEN_REQUEST_POLL_MS = 120;
  const FRESH_OPEN_REQUEST_MS = 5000;
  const OPEN_REQUEST_FILE_PREFIX = "eagle-video-grid-comparator";
  const DEFAULT_PLUGIN_ID = "3c8cd4a3-b779-4c25-9436-6f29963fcd34";

  const state = {
    items: [],
    videos: [],
    mediaElements: new Set(),
    pendingMediaLoads: new Set(),
    pendingSeekCleanups: new Set(),
    duration: 0,
    currentTime: 0,
    playbackRate: 1,
    playing: false,
    looping: false,
    audioIndex: 0,
    muted: false,
    anchorTime: 0,
    anchorStamp: 0,
    lastCorrectionStamp: 0,
    frameRequest: 0,
    scrubbing: false,
    scrubWasPlaying: false,
    pendingScrubTime: null,
    scrubSeekTimer: 0,
    lastScrubSeekStamp: 0,
    seekToken: 0,
    seekInFlight: false,
    seekResumeRequested: false,
    loadToken: 0,
    reloadTimer: 0,
    toastTimer: 0,
    playbackCheckTimer: 0,
    closeFallbackTimer: 0,
    openRequestTimer: 0,
    openRequestBridge: null,
    lastOpenRequestId: "",
    openRequestCheckInFlight: false,
    runRequested: false,
    bootHideTimer: 0,
    zoom: MIN_ZOOM,
    panX: 0,
    panY: 0,
    drag: null
  };

  const ui = {};

  function cacheUi() {
    ui.app = document.querySelector("#app");
    ui.grid = document.querySelector("#videoGrid");
    ui.empty = document.querySelector("#emptyState");
    ui.emptyKicker = document.querySelector("#emptyKicker");
    ui.emptyTitle = document.querySelector("#emptyTitle");
    ui.emptyMessage = document.querySelector("#emptyMessage");
    ui.status = document.querySelector("#statusPill");
    ui.reload = document.querySelector("#reloadButton");
    ui.restart = document.querySelector("#restartButton");
    ui.play = document.querySelector("#playButton");
    ui.playIcon = document.querySelector("#playIcon");
    ui.timeline = document.querySelector("#timeline");
    ui.timelineProgress = document.querySelector("#timelineProgress");
    ui.currentTime = document.querySelector("#currentTime");
    ui.durationTime = document.querySelector("#durationTime");
    ui.loop = document.querySelector("#loopButton");
    ui.speed = document.querySelector("#speedSelect");
    ui.resetView = document.querySelector("#resetViewButton");
    ui.zoomLevel = document.querySelector("#zoomLevel");
    ui.audio = document.querySelector("#audioButton");
    ui.audioSource = document.querySelector("#audioSource");
    ui.toast = document.querySelector("#toast");
  }

  function bindUi() {
    ui.reload.addEventListener("click", scheduleSelectionReload);
    ui.restart.addEventListener("click", () => seekTo(0));
    ui.play.addEventListener("click", togglePlayback);
    ui.timeline.addEventListener("pointerdown", beginTimelineScrub);
    ui.timeline.addEventListener("input", handleTimelineInput);
    ui.timeline.addEventListener("change", finishTimelineScrub);
    ui.timeline.addEventListener("pointerup", () => {
      window.setTimeout(() => {
        if (state.scrubbing) finishTimelineScrub();
      }, 0);
    });
    ui.timeline.addEventListener("pointercancel", finishTimelineScrub);
    ui.timeline.addEventListener("blur", () => {
      if (state.scrubbing) finishTimelineScrub();
    });
    ui.loop.addEventListener("click", toggleLoop);
    ui.speed.addEventListener("change", (event) => setPlaybackRate(Number(event.target.value)));
    ui.resetView.addEventListener("click", resetView);
    ui.audio.addEventListener("click", cycleAudioSource);
    window.addEventListener("keydown", handleKeydown);
  }

  async function initialize(plugin) {
    cacheUi();
    bindUi();
    await applyTheme(window.eagle?.app?.theme);

    // Inside Eagle the window stays hidden until onPluginRun or an inspector
    // request. A plain browser preview shows the selection immediately.
    if (window.eagle) {
      startOpenRequestBridge(plugin);
      try {
        await window.eagle.window?.setOpacity?.(0);
        await window.eagle.window?.hide?.();
      } catch (error) {
        console.warn("Could not hide the comparator before it was opened.", error);
      }
      return;
    }
    await fitWindowToDisplay();
    scheduleSelectionReload();
  }

  async function applyTheme(theme) {
    const resolved = String(await theme || "DARK").toUpperCase();
    document.body.setAttribute("theme", resolved);
  }

  function normalizedPluginId(plugin) {
    return String(
      plugin?.manifest?.id ||
      window.eagle?.plugin?.manifest?.id ||
      DEFAULT_PLUGIN_ID
    ).replace(/[^a-z0-9_-]/gi, "_");
  }

  // The inspector runs in a separate renderer. When Eagle cannot open the
  // plugin directly, the inspector leaves a small request file in the OS temp
  // directory and this window answers it.
  function createOpenRequestBridge(plugin) {
    if (typeof require !== "function") return null;

    try {
      const fs = require("fs");
      const os = require("os");
      const path = require("path");
      const filePath = path.join(
        os.tmpdir(),
        `${OPEN_REQUEST_FILE_PREFIX}-${normalizedPluginId(plugin)}.json`
      );

      return {
        read() {
          try {
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
          } catch {
            return null;
          }
        },
        acknowledge(request, opened) {
          try {
            fs.writeFileSync(filePath, JSON.stringify({
              ...request,
              handledAt: Date.now(),
              opened: Boolean(opened)
            }), "utf8");
          } catch (error) {
            console.warn("Could not acknowledge the inspector bridge request.", error);
          }
        },
        remove() {
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            if (error?.code !== "ENOENT") console.warn("Could not remove the inspector bridge file.", error);
          }
        }
      };
    } catch (error) {
      console.warn("Could not create the inspector bridge.", error);
      return null;
    }
  }

  function startOpenRequestBridge(plugin) {
    stopOpenRequestBridge(false);
    state.openRequestBridge = createOpenRequestBridge(plugin);
    if (!state.openRequestBridge) return;

    const existing = state.openRequestBridge.read?.();
    const existingAge = Date.now() - Number(existing?.createdAt || 0);
    const existingIsFresh = existingAge >= 0 && existingAge <= FRESH_OPEN_REQUEST_MS && !existing?.handledAt;
    state.lastOpenRequestId = existingIsFresh ? "" : String(existing?.requestId || "");
    state.openRequestTimer = window.setInterval(checkOpenRequestBridge, OPEN_REQUEST_POLL_MS);
    checkOpenRequestBridge();
  }

  function stopOpenRequestBridge(removeFile) {
    window.clearInterval(state.openRequestTimer);
    state.openRequestTimer = 0;
    if (removeFile) state.openRequestBridge?.remove?.();
    state.openRequestBridge = null;
    state.openRequestCheckInFlight = false;
  }

  async function checkOpenRequestBridge() {
    if (!state.openRequestBridge || state.openRequestCheckInFlight) return;
    state.openRequestCheckInFlight = true;

    try {
      const request = state.openRequestBridge.read?.();
      const requestId = String(request?.requestId || "");
      if (!requestId || requestId === state.lastOpenRequestId) return;
      state.lastOpenRequestId = requestId;
      const opened = await showPluginWindow();
      state.openRequestBridge.acknowledge?.(request, opened);
    } finally {
      state.openRequestCheckInFlight = false;
    }
  }

  function registerLifecycle() {
    if (window.eagle && typeof window.eagle.onPluginCreate === "function") {
      window.eagle.onPluginCreate(initialize);
      window.eagle.onPluginRun(handlePluginRun);
      window.eagle.onPluginShow(handlePluginShow);
      window.eagle.onPluginHide(handlePluginHide);
      window.eagle.onPluginBeforeExit(cleanup);
      window.eagle.onThemeChanged(applyTheme);
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
      initialize();
    }
  }

  async function hideWindowUntilRun() {
    if (!window.eagle || state.runRequested) return;

    try {
      await window.eagle.window?.setOpacity?.(0);
      await window.eagle.window?.hide?.();
    } catch (error) {
      console.warn("Could not hide the comparator while Eagle was starting.", error);
    }

    // If Eagle launched the plugin while the hide was still pending, honor
    // that explicit run request now that the window is hidden.
    if (state.runRequested) await showPluginWindow();
  }

  function keepWindowHiddenUntilRun() {
    if (!window.eagle) return;
    window.clearInterval(state.bootHideTimer);
    let attempts = 0;

    const ensureHidden = () => {
      if (state.runRequested || attempts >= 24) {
        window.clearInterval(state.bootHideTimer);
        state.bootHideTimer = 0;
        return;
      }

      attempts += 1;
      void hideWindowUntilRun();
    };

    ensureHidden();
    state.bootHideTimer = window.setInterval(ensureHidden, 250);
  }

  function handlePluginRun() {
    state.runRequested = true;
    window.clearInterval(state.bootHideTimer);
    state.bootHideTimer = 0;
    return showPluginWindow();
  }

  async function showPluginWindow() {
    window.clearTimeout(state.closeFallbackTimer);
    state.closeFallbackTimer = 0;
    scheduleSelectionReload();
    try {
      await window.eagle?.window?.setOpacity?.(1);
      await window.eagle?.window?.show?.();
      await window.eagle?.window?.focus?.();
      return true;
    } catch (error) {
      console.warn("Could not show the comparator window.", error);
      return false;
    }
  }

  async function handlePluginShow() {
    // Eagle may emit this event while it is starting. Revealing the window here
    // would make the comparator appear without a user action.
    if (window.eagle && !state.runRequested) {
      await hideWindowUntilRun();
      return;
    }
    scheduleSelectionReload();
  }

  async function hidePluginWindow() {
    releaseViewerResources();
    window.clearTimeout(state.closeFallbackTimer);
    state.closeFallbackTimer = 0;

    try {
      window.close();

      // Eagle normally destroys a window plugin after window.close(). If the
      // host blocks that browser call, retain the lightweight launch bridge
      // but keep every media resource detached while the window is hidden.
      if (window.eagle?.window?.hide) {
        state.closeFallbackTimer = window.setTimeout(async () => {
          state.closeFallbackTimer = 0;
          if (window.closed) return;
          try {
            await window.eagle.window.setOpacity?.(0);
            await window.eagle.window.hide();
          } catch (error) {
            console.warn("Could not hide the comparator after close was blocked.", error);
          }
        }, 100);
      }
    } catch (error) {
      console.warn("Could not close the comparator window.", error);
      try {
        await window.eagle?.window?.setOpacity?.(0);
        await window.eagle?.window?.hide?.();
      } catch (hideError) {
        console.warn("Could not hide the comparator window.", hideError);
      }
    }
  }

  function handlePluginHide() {
    releaseViewerResources();
  }

  function scheduleSelectionReload() {
    window.clearTimeout(state.reloadTimer);
    state.reloadTimer = window.setTimeout(loadSelection, 60);
  }

  async function fitWindowToDisplay(itemCount = 4) {
    if (!window.eagle?.window?.setBounds || !window.eagle?.screen) return;

    try {
      const cursor = window.eagle.screen.getCursorScreenPoint
        ? await window.eagle.screen.getCursorScreenPoint()
        : null;
      const display = cursor && window.eagle.screen.getDisplayNearestPoint
        ? await window.eagle.screen.getDisplayNearestPoint(cursor)
        : await window.eagle.screen.getPrimaryDisplay();
      const bounds = calculateWindowBounds(display, itemCount);
      if (bounds) await window.eagle.window.setBounds(bounds);
    } catch (error) {
      console.warn("Could not fit the plugin window to the display.", error);
    }
  }

  function calculateWindowBounds(display, itemCount = 4) {
    const area = display?.workArea || display?.bounds;
    if (!area || !Number.isFinite(area.width) || !Number.isFinite(area.height)) return null;

    const screenHeight = Number.isFinite(display?.bounds?.height) ? display.bounds.height : area.height;
    const heightLimit = Math.max(1, Math.floor(area.height - 48));
    const heightFloor = Math.min(560, heightLimit);
    const height = Math.min(heightLimit, Math.max(heightFloor, Math.round(screenHeight * WINDOW_HEIGHT_RATIO)));
    const aspect = itemCount === 2 ? 1.45 : itemCount === 3 ? 1.3 : 1;
    const widthLimit = Math.max(1, Math.floor(area.width - 48));
    const widthFloor = Math.min(640, widthLimit);
    const width = Math.min(widthLimit, Math.max(widthFloor, Math.round(height * aspect)));
    const x = Math.round((Number(area.x) || 0) + (area.width - width) / 2);
    const y = Math.round((Number(area.y) || 0) + (area.height - height) / 2);

    return { x, y, width, height };
  }

  async function getSelectedItems() {
    if (window.eagle?.item?.getSelected) {
      return window.eagle.item.getSelected();
    }

    if (Array.isArray(window.__VIDEO_GRID_PREVIEW_ITEMS__)) {
      return window.__VIDEO_GRID_PREVIEW_ITEMS__;
    }

    throw new Error("Eagle Plugin API is unavailable. Open this plugin from Eagle.");
  }

  async function loadSelection() {
    const token = ++state.loadToken;
    resetViewer();
    setStatus("Loading selection", "loading");
    showEmpty("Loading", "Reading the current Eagle selection…", "The plugin does not modify or copy your files.");

    try {
      const selected = await getSelectedItems();
      if (token !== state.loadToken) return;

      const validation = validateSelection(selected);
      if (!validation.ok) {
        showSelectionError(validation.title, validation.message);
        return;
      }

      state.items = validation.items;
      await fitWindowToDisplay(validation.items.length);
      if (token !== state.loadToken) return;
      await buildGrid(validation.items, token);
    } catch (error) {
      if (token !== state.loadToken) return;
      showSelectionError("Could not read the selection", error?.message || "Unknown Eagle API error.");
    }
  }

  function validateSelection(selected) {
    if (!Array.isArray(selected)) {
      return {
        ok: false,
        title: "Could not read the selection",
        message: "Eagle returned an unexpected selection value."
      };
    }

    const videos = selected.filter((item) => VIDEO_EXTENSIONS.has(normalizeExtension(item?.ext)));
    if (videos.length !== selected.length) {
      return {
        ok: false,
        title: "The selection contains non-video files",
        message: "Select only 2–4 video items, then run the plugin again."
      };
    }

    if (videos.length < MIN_VIDEOS || videos.length > MAX_VIDEOS) {
      return {
        ok: false,
        title: `Select ${MIN_VIDEOS}–${MAX_VIDEOS} videos`,
        message: `The current selection contains ${videos.length} video${videos.length === 1 ? "" : "s"}.`
      };
    }

    const missingSources = videos.filter((item) => !item.fileURL);
    if (missingSources.length) {
      return {
        ok: false,
        title: "A selected video has no local file URL",
        message: "Reload the Eagle library and try the selection again."
      };
    }

    return { ok: true, items: videos };
  }

  function normalizeExtension(extension) {
    return String(extension || "").replace(/^\./, "").trim().toLowerCase();
  }

  async function buildGrid(items, token) {
    ui.grid.className = `video-grid count-${items.length}`;
    ui.grid.style.setProperty("--column-count", String(items.length));

    const metadataPromises = items.map((item, index) => createVideoTile(item, index));
    const results = await Promise.all(metadataPromises);
    if (token !== state.loadToken) return;

    state.videos = results.map((result) => result.video);
    applyViewTransform();
    const playable = results.filter((result) => result.ok && Number.isFinite(result.video.duration));
    state.duration = Math.max(0, ...playable.map((result) => result.video.duration));

    if (!playable.length || state.duration <= 0) {
      showSelectionError("These videos could not be played", "Eagle's browser could not decode any selected file. MP4 with H.264 is the safest format.");
      return;
    }

    state.currentTime = 0;
    state.audioIndex = 0;
    state.muted = false;
    applyAudioState();
    enableControls(true);
    updateTimeline();
    updateAudioLabel();
    ui.empty.hidden = true;
    ui.grid.classList.add("is-ready");
    ui.app.setAttribute("aria-busy", "false");

    const failedCount = results.length - playable.length;
    setStatus(`${items.length} clips synced`, "ready");
    if (failedCount) {
      showToast(`${failedCount} selected video${failedCount === 1 ? "" : "s"} could not be decoded.`);
    }
  }

  function createVideoTile(item, index) {
    return new Promise((resolve) => {
      const tile = document.createElement("article");
      tile.className = "video-tile";

      const label = document.createElement("div");
      label.className = "video-label";

      const number = document.createElement("span");
      number.className = "video-index";
      number.textContent = String(index + 1).padStart(2, "0");

      const name = document.createElement("span");
      name.className = "video-name";
      name.textContent = displayName(item);
      name.title = displayName(item);

      const loading = document.createElement("div");
      loading.className = "video-state";
      loading.textContent = "Loading video…";

      const video = document.createElement("video");
      state.mediaElements.add(video);
      video.preload = "metadata";
      video.playsInline = true;
      video.disablePictureInPicture = true;
      video.controls = false;
      video.draggable = false;
      video.muted = true;
      video.setAttribute("controlslist", "nodownload noplaybackrate noremoteplayback");
      video.setAttribute("aria-label", displayName(item));
      video.src = item.fileURL;

      label.append(number, name);
      tile.append(video, label, loading);
      ui.grid.append(tile);

      tile.addEventListener("wheel", handleTileWheel, { passive: false });
      tile.addEventListener("pointerdown", handleTilePointerDown);
      tile.addEventListener("pointermove", handleTilePointerMove);
      tile.addEventListener("pointerup", handleTilePointerEnd);
      tile.addEventListener("pointercancel", handleTilePointerCancel);

      let settled = false;
      let timeout = 0;
      const cancelLoad = () => settle(false, "Loading was interrupted.");
      const handleLoadedMetadata = () => settle(
        Number.isFinite(video.duration) && video.duration > 0,
        "This video has no readable duration."
      );
      const handleError = () => settle(false, mediaErrorMessage(video.error));
      const settle = (ok, message) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        state.pendingMediaLoads.delete(cancelLoad);
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("error", handleError);
        if (ok) {
          loading.hidden = true;
        } else {
          loading.classList.add("is-error");
          loading.textContent = message;
        }
        resolve({ ok, video, item });
      };

      state.pendingMediaLoads.add(cancelLoad);
      timeout = window.setTimeout(() => settle(false, "Timed out while reading this video."), 12000);
      video.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
      video.addEventListener("error", handleError, { once: true });
      video.load();
    });
  }

  function handleTileWheel(event) {
    if (!ui.grid.classList.contains("is-ready")) return;
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const focalX = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
    const focalY = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);
    const limitedDelta = clamp(event.deltaY, -240, 240);
    let nextZoom = clamp(
      state.zoom * Math.exp(-limitedDelta * WHEEL_ZOOM_SENSITIVITY),
      MIN_ZOOM,
      MAX_ZOOM
    );

    if (nextZoom < 1.01) nextZoom = MIN_ZOOM;
    if (Math.abs(nextZoom - state.zoom) < 0.001) return;

    const ratio = nextZoom / state.zoom;
    state.panX = focalX - ratio * (focalX - state.panX);
    state.panY = focalY - ratio * (focalY - state.panY);
    state.zoom = nextZoom;
    clampPan();
    applyViewTransform();
  }

  function handleTilePointerDown(event) {
    if (event.button !== 0 || !ui.grid.classList.contains("is-ready")) return;

    const tile = event.currentTarget;
    const rect = tile.getBoundingClientRect();
    state.drag = {
      pointerId: event.pointerId,
      tile,
      rect,
      startX: event.clientX,
      startY: event.clientY,
      basePanX: state.panX,
      basePanY: state.panY,
      moved: false
    };

    tile.setPointerCapture?.(event.pointerId);
    if (state.zoom > MIN_ZOOM) ui.grid.classList.add("is-panning");
    event.preventDefault();
  }

  function handleTilePointerMove(event) {
    const drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) drag.moved = true;
    if (!drag.moved || state.zoom <= MIN_ZOOM) return;

    state.panX = drag.basePanX + dx / drag.rect.width;
    state.panY = drag.basePanY + dy / drag.rect.height;
    clampPan();
    applyViewTransform();
  }

  function handleTilePointerEnd(event) {
    const drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const shouldToggle = !drag.moved;
    finishTilePointer(drag, event.pointerId);
    if (shouldToggle) togglePlayback();
  }

  function handleTilePointerCancel(event) {
    const drag = state.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    finishTilePointer(drag, event.pointerId);
  }

  function finishTilePointer(drag, pointerId) {
    try {
      if (drag.tile.hasPointerCapture?.(pointerId)) drag.tile.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already be released when the window loses focus.
    }
    state.drag = null;
    ui.grid.classList.remove("is-panning");
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function clampPan() {
    if (state.zoom <= MIN_ZOOM) {
      state.panX = 0;
      state.panY = 0;
      return;
    }

    const limit = (state.zoom - 1) / 2;
    state.panX = clamp(state.panX, -limit, limit);
    state.panY = clamp(state.panY, -limit, limit);
  }

  function applyViewTransform() {
    const zoomed = state.zoom > MIN_ZOOM + 0.001;
    const transform = zoomed
      ? `translate3d(${(state.panX * 100).toFixed(3)}%, ${(state.panY * 100).toFixed(3)}%, 0) scale(${state.zoom.toFixed(4)})`
      : "";

    state.videos.forEach((video) => {
      video.style.transform = transform;
    });
    ui.grid?.classList.toggle("is-zoomed", zoomed);
    if (!zoomed) ui.grid?.classList.remove("is-panning");
    if (ui.zoomLevel) ui.zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function resetView() {
    state.zoom = MIN_ZOOM;
    state.panX = 0;
    state.panY = 0;
    state.drag = null;
    applyViewTransform();
  }

  function displayName(item) {
    const name = String(item?.name || "Untitled video");
    const extension = normalizeExtension(item?.ext);
    return extension && !name.toLowerCase().endsWith(`.${extension}`) ? `${name}.${extension}` : name;
  }

  function mediaErrorMessage(error) {
    const messages = {
      1: "Loading was interrupted.",
      2: "The local video could not be read.",
      3: "This video could not be decoded.",
      4: "This video format or codec is not supported."
    };
    return messages[error?.code] || "This video could not be loaded.";
  }

  function resetViewer() {
    cancelSeekWork();
    pausePlayback();
    resetView();
    state.items = [];
    Array.from(state.pendingMediaLoads).forEach((cancelLoad) => cancelLoad());
    state.pendingMediaLoads.clear();
    state.mediaElements.forEach(releaseMediaElement);
    state.mediaElements.clear();
    state.videos = [];
    state.duration = 0;
    state.currentTime = 0;
    ui.grid?.replaceChildren();
    if (ui.grid) ui.grid.className = "video-grid";
    enableControls(false);
    updateTimeline();
    if (ui.empty) ui.empty.hidden = false;
    if (ui.app) ui.app.setAttribute("aria-busy", "true");
  }

  function releaseMediaElement(video) {
    try {
      video.pause();
      video.removeAttribute("src");
      if ("srcObject" in video) video.srcObject = null;
      video.load();
    } catch {
      // The renderer may already be unloading; the element can still be released.
    }
  }

  function releaseViewerResources() {
    state.loadToken += 1;
    window.clearTimeout(state.reloadTimer);
    state.reloadTimer = 0;
    window.clearTimeout(state.toastTimer);
    state.toastTimer = 0;
    window.clearTimeout(state.playbackCheckTimer);
    state.playbackCheckTimer = 0;
    if (ui.toast) ui.toast.classList.remove("is-visible");
    resetViewer();
  }

  function showSelectionError(title, message) {
    resetViewer();
    setStatus("Selection required", "error");
    showEmpty("Selection check", title, message);
    ui.app.setAttribute("aria-busy", "false");
  }

  function showEmpty(kicker, title, message) {
    ui.empty.hidden = false;
    ui.emptyKicker.textContent = kicker;
    ui.emptyTitle.textContent = title;
    ui.emptyMessage.textContent = message;
  }

  function setStatus(label, type) {
    ui.status.textContent = label;
    ui.status.classList.toggle("is-ready", type === "ready");
    ui.status.classList.toggle("is-error", type === "error");
  }

  function enableControls(enabled) {
    [ui.restart, ui.play, ui.timeline, ui.loop, ui.speed, ui.resetView, ui.audio].forEach((element) => {
      if (element) element.disabled = !enabled;
    });
  }

  function togglePlayback() {
    if (!state.videos.length) return;
    if (state.scrubbing) return;
    if (state.seekInFlight) {
      state.seekResumeRequested = !state.seekResumeRequested;
      setPlayVisual(state.seekResumeRequested);
      return;
    }
    if (state.playing) pausePlayback();
    else void startPlayback();
  }

  async function startPlayback() {
    if (!state.duration) return;
    if (state.scrubbing) return;
    if (state.seekInFlight) {
      state.seekResumeRequested = true;
      setPlayVisual(true);
      return;
    }
    if (state.currentTime >= state.duration - END_EPSILON) {
      await performCoordinatedSeek(0, false);
      if (!state.duration || state.scrubbing || state.seekInFlight) return;
    }

    state.playing = true;
    state.anchorTime = state.currentTime;
    state.anchorStamp = performance.now();
    state.lastCorrectionStamp = 0;
    setPlayVisual(true);
    applyAudioState();

    const target = state.currentTime;
    state.videos.forEach((video) => {
      if (!isPlayable(video) || target >= video.duration - END_EPSILON) return;
      if (Math.abs(video.currentTime - target) > DRIFT_LIMIT_SECONDS) video.currentTime = clampTime(target, video.duration);
      video.playbackRate = state.playbackRate;
      video.play().catch(() => {});
    });

    state.frameRequest = requestAnimationFrame(tick);

    window.clearTimeout(state.playbackCheckTimer);
    state.playbackCheckTimer = window.setTimeout(() => {
      state.playbackCheckTimer = 0;
      if (!state.playing) return;
      const hasRunningVideo = state.videos.some((video) => isPlayable(video) && !video.paused);
      if (!hasRunningVideo) {
        pausePlayback();
        showToast("Playback could not start. Try MP4 with H.264 video.");
      }
    }, 900);
  }

  function pausePlayback() {
    window.clearTimeout(state.playbackCheckTimer);
    state.playbackCheckTimer = 0;
    if (state.frameRequest) cancelAnimationFrame(state.frameRequest);
    state.frameRequest = 0;
    if (state.playing) state.currentTime = clockTime(performance.now());
    state.playing = false;
    state.videos.forEach((video) => video.pause());
    setPlayVisual(false);
    updateTimeline();
  }

  function tick(stamp) {
    if (!state.playing) return;

    let target = clockTime(stamp);
    if (target >= state.duration) {
      if (state.looping) {
        target %= state.duration;
        syncSeek(target);
        state.anchorTime = target;
        state.anchorStamp = stamp;
        state.lastCorrectionStamp = 0;
      } else {
        state.currentTime = state.duration;
        pausePlayback();
        syncSeek(state.duration);
        return;
      }
    }

    state.currentTime = target;
    if (stamp - state.lastCorrectionStamp >= CORRECTION_INTERVAL_MS) {
      correctDrift(target);
      state.lastCorrectionStamp = stamp;
    }
    updateTimeline();
    state.frameRequest = requestAnimationFrame(tick);
  }

  function correctDrift(target) {
    if (state.scrubbing || state.seekInFlight) return;
    state.videos.forEach((video) => {
      if (!isPlayable(video)) return;
      const localTarget = clampTime(target, video.duration);

      if (target >= video.duration - END_EPSILON) {
        if (!video.paused) video.pause();
        if (Math.abs(video.currentTime - localTarget) > END_EPSILON) video.currentTime = localTarget;
        return;
      }

      video.playbackRate = state.playbackRate;
      if (Math.abs(video.currentTime - localTarget) > DRIFT_LIMIT_SECONDS) video.currentTime = localTarget;
      if (video.paused && state.playing) video.play().catch(() => {});
    });
  }

  function clockTime(stamp) {
    if (!state.playing) return state.currentTime;
    return state.anchorTime + ((stamp - state.anchorStamp) / 1000) * state.playbackRate;
  }

  function normalizeSeekTime(time) {
    return Math.max(0, Math.min(Number(time) || 0, state.duration));
  }

  function beginTimelineScrub() {
    if (!state.duration || state.scrubbing) return;
    const shouldResume = state.playing || (state.seekInFlight && state.seekResumeRequested);
    state.seekToken += 1;
    state.seekInFlight = false;
    state.seekResumeRequested = false;
    cancelScheduledScrubSeek();
    state.scrubbing = true;
    state.scrubWasPlaying = shouldResume;
    state.lastScrubSeekStamp = 0;

    if (state.playing) pausePlayback();
    else state.videos.forEach((video) => video.pause());
  }

  function handleTimelineInput(event) {
    if (!state.duration) return;
    if (!state.scrubbing) beginTimelineScrub();
    const next = normalizeSeekTime(event?.target?.value);
    state.currentTime = next;
    updateTimeline();
    queueScrubPreview(next);
  }

  function queueScrubPreview(time) {
    state.pendingScrubTime = time;
    if (state.scrubSeekTimer) return;

    const elapsed = performance.now() - state.lastScrubSeekStamp;
    const delay = Math.max(0, SCRUB_SEEK_INTERVAL_MS - elapsed);
    if (delay <= 0) {
      flushScrubPreview();
      return;
    }
    state.scrubSeekTimer = window.setTimeout(flushScrubPreview, delay);
  }

  function flushScrubPreview() {
    window.clearTimeout(state.scrubSeekTimer);
    state.scrubSeekTimer = 0;
    if (!state.scrubbing || state.pendingScrubTime === null) return;

    const target = state.pendingScrubTime;
    state.pendingScrubTime = null;
    state.lastScrubSeekStamp = performance.now();
    syncSeek(target, true);
  }

  function cancelScheduledScrubSeek() {
    window.clearTimeout(state.scrubSeekTimer);
    state.scrubSeekTimer = 0;
    state.pendingScrubTime = null;
  }

  function finishTimelineScrub() {
    if (!state.scrubbing || !state.duration) return;
    const next = normalizeSeekTime(ui.timeline.value);
    const shouldResume = state.scrubWasPlaying;
    state.scrubbing = false;
    state.scrubWasPlaying = false;
    cancelScheduledScrubSeek();
    void performCoordinatedSeek(next, shouldResume);
  }

  function seekTo(time) {
    if (!state.duration) return Promise.resolve(false);
    const shouldResume = state.playing || (state.seekInFlight && state.seekResumeRequested);
    return performCoordinatedSeek(time, shouldResume);
  }

  async function performCoordinatedSeek(time, shouldResume) {
    if (!state.duration) return false;
    const next = normalizeSeekTime(time);
    const token = ++state.seekToken;

    if (state.playing) pausePlayback();
    else {
      state.videos.forEach((video) => video.pause());
      setPlayVisual(false);
    }

    state.seekInFlight = true;
    state.seekResumeRequested = Boolean(shouldResume);
    state.currentTime = next;
    syncSeek(next);
    updateTimeline();

    await waitForSynchronizedSeek(next);
    if (token !== state.seekToken) return false;

    const resume = state.seekResumeRequested;
    state.seekInFlight = false;
    state.seekResumeRequested = false;
    state.currentTime = next;
    updateTimeline();

    if (resume && !state.scrubbing && next < state.duration - END_EPSILON) {
      await startPlayback();
    }
    return true;
  }

  function waitForSynchronizedSeek(time) {
    const waits = state.videos
      .filter(isPlayable)
      .map((video) => waitForVideoSeek(video, clampTime(time, video.duration)));
    return Promise.allSettled(waits);
  }

  function waitForVideoSeek(video, target) {
    if (!video.seeking && Math.abs(video.currentTime - target) <= SEEK_TARGET_EPSILON) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let settled = false;
      let timeout = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        video.removeEventListener("seeked", finish);
        state.pendingSeekCleanups.delete(finish);
        resolve();
      };
      state.pendingSeekCleanups.add(finish);
      video.addEventListener("seeked", finish);
      timeout = window.setTimeout(finish, SEEK_SETTLE_TIMEOUT_MS);
    });
  }

  function syncSeek(time, fast = false) {
    state.videos.forEach((video) => {
      if (!isPlayable(video)) return;
      const target = clampTime(time, video.duration);
      if (Math.abs(video.currentTime - target) <= SEEK_TARGET_EPSILON) return;
      try {
        if (fast && typeof video.fastSeek === "function") video.fastSeek(target);
        else video.currentTime = target;
      } catch {
        try {
          video.currentTime = target;
        } catch {
          // A metadata-ready video can still briefly reject a seek while its decoder opens.
        }
      }
    });
  }

  function cancelSeekWork() {
    state.seekToken += 1;
    cancelScheduledScrubSeek();
    Array.from(state.pendingSeekCleanups).forEach((finish) => finish());
    state.pendingSeekCleanups.clear();
    state.scrubbing = false;
    state.scrubWasPlaying = false;
    state.seekInFlight = false;
    state.seekResumeRequested = false;
  }

  function clampTime(time, duration) {
    return Math.max(0, Math.min(time, Math.max(0, duration - 0.001)));
  }

  function isPlayable(video) {
    return Number.isFinite(video?.duration) && video.duration > 0 && !video.error;
  }

  function setPlaybackRate(rate) {
    if (!Number.isFinite(rate) || rate <= 0) return;
    if (state.playing) {
      state.currentTime = clockTime(performance.now());
      state.anchorTime = state.currentTime;
      state.anchorStamp = performance.now();
    }
    state.playbackRate = rate;
    state.videos.forEach((video) => { video.playbackRate = rate; });
  }

  function toggleLoop() {
    state.looping = !state.looping;
    ui.loop.setAttribute("aria-pressed", String(state.looping));
  }

  function cycleAudioSource() {
    if (!state.videos.length) return;
    if (state.muted) {
      state.muted = false;
    } else if (state.audioIndex < state.videos.length - 1) {
      state.audioIndex += 1;
    } else {
      state.audioIndex = 0;
      state.muted = true;
    }
    applyAudioState();
    updateAudioLabel();
  }

  function toggleMute() {
    if (!state.videos.length) return;
    state.muted = !state.muted;
    applyAudioState();
    updateAudioLabel();
  }

  function chooseAudio(index) {
    if (index < 0 || index >= state.videos.length) return;
    state.audioIndex = index;
    state.muted = false;
    applyAudioState();
    updateAudioLabel();
  }

  function applyAudioState() {
    state.videos.forEach((video, index) => {
      video.muted = state.muted || index !== state.audioIndex;
    });
  }

  function updateAudioLabel() {
    if (!ui.audioSource) return;
    ui.audioSource.textContent = state.muted ? "Off" : String(state.audioIndex + 1).padStart(2, "0");
    ui.audio.setAttribute("aria-pressed", String(!state.muted));
  }

  function setPlayVisual(playing) {
    if (!ui.playIcon) return;
    ui.playIcon.classList.toggle("is-pause", playing);
    ui.play.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  function updateTimeline() {
    if (!ui.timeline) return;
    const duration = state.duration || 0;
    const current = Math.max(0, Math.min(state.currentTime || 0, duration));
    ui.timeline.max = String(duration || 1);
    ui.timeline.value = String(current);
    const progress = duration > 0 ? (current / duration) * 100 : 0;
    if (ui.timelineProgress) ui.timelineProgress.style.width = `${progress}%`;
    ui.currentTime.textContent = formatTime(current);
    ui.durationTime.textContent = formatTime(duration);
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const wholeSeconds = Math.floor(safe % 60);
    const milliseconds = Math.floor((safe - Math.floor(safe)) * 1000);
    const base = `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
    return hours > 0 ? `${String(hours).padStart(2, "0")}:${base}` : base;
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      hidePluginWindow();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;

    const seekStep = event.shiftKey ? 0.1 : 1;
    if (event.code === "Space") {
      event.preventDefault();
      togglePlayback();
    } else if (event.code === "ArrowLeft") {
      event.preventDefault();
      seekTo(state.currentTime - seekStep);
    } else if (event.code === "ArrowRight") {
      event.preventDefault();
      seekTo(state.currentTime + seekStep);
    } else if (event.code === "Home") {
      event.preventDefault();
      seekTo(0);
    } else if (event.key === "0") {
      resetView();
    } else if (event.key.toLowerCase() === "l") {
      toggleLoop();
    } else if (event.key.toLowerCase() === "m") {
      toggleMute();
    } else if (/^[1-4]$/.test(event.key)) {
      chooseAudio(Number(event.key) - 1);
    }
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    ui.toast.textContent = message;
    ui.toast.classList.add("is-visible");
    state.toastTimer = window.setTimeout(() => ui.toast.classList.remove("is-visible"), 3600);
  }

  function cleanup() {
    window.clearTimeout(state.closeFallbackTimer);
    state.closeFallbackTimer = 0;
    window.clearInterval(state.bootHideTimer);
    state.bootHideTimer = 0;
    stopOpenRequestBridge(true);
    releaseViewerResources();
    state.drag = null;
  }

  registerLifecycle();
  keepWindowHiddenUntilRun();
})();
