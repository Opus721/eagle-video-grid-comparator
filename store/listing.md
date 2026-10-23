# Eagle Plugin Center listing

Copy for the submission form. Update it together with `CHANGELOG.md` whenever a release changes user-visible behavior: the listing must describe only what the submitted version does.

Assets in this folder:

| File | Use |
| --- | --- |
| `../logo.png` | Plugin icon, 256×256, already inside the package |
| `cover-en.png` | English cover, 2400×1600 |
| `cover-zh-CN.png` | Simplified Chinese cover, 2400×1600 |
| `screenshot.png` | Real comparator window with four clips at 143% synchronized zoom, used in the README |

The covers show the real 1.4.0 window rendered with four graded versions of one synthetic clip.

## English

**Name:** Video Grid Comparator

**Short description** (200 code points max):

> Play 2–4 selected videos side by side with one shared timeline, synchronized zoom and pan, and a Compare button right in the inspector.

**Introduction:**

> Video Grid Comparator plays two to four videos from your Eagle library side by side under one synchronized transport. Use it to pick between takes, check color grades, or review edits frame against frame.
>
> **How to use**
> 1. Select 2–4 videos in Eagle.
> 2. Press **Compare** in the inspector, or run Video Grid Comparator from the Plugin menu.
> 3. Review the clips with the shared controls. Press Esc to close.
>
> **Features**
> - Two or three clips in a row, four in a 2×2 grid.
> - One timeline, play/pause, speed (0.25×–2×), and loop for every clip.
> - Choose which clip is audible, or mute all.
> - Mouse-wheel zoom and drag-to-pan applied to every clip at once, so you inspect the same detail everywhere.
> - Smooth scrubbing on three and four clips.
> - Keyboard shortcuts: Space play/pause, ←/→ seek 1 s, Shift+←/→ seek 0.1 s, 0 reset zoom, Home restart, L loop, M mute, 1–4 audio source.
> - Follows Eagle's light and dark themes.
>
> **Formats:** MP4, MOV, M4V, WebM, MKV, AVI, WMV, MPG, MPEG, M2TS, and TS items are accepted. Playback depends on the codec support of Eagle's built-in browser; MP4 with H.264 is the most reliable. A clip that cannot be decoded is marked in its tile.
>
> **Your files and privacy:** the plugin only reads the selected items and plays them from their local files. It never modifies, moves, copies, or uploads anything and makes no internet connections. To open from the inspector it asks the Eagle app on your computer (127.0.0.1) to open the plugin; as a fallback it writes a tiny launch request (an ID and a timestamp) to the system temp folder.
>
> Free and open source under the MIT license.

**Changelog for this version:**

> Initial release: synchronized playback of 2–4 videos with a shared timeline, speed, loop, audio source, synchronized zoom and pan, keyboard shortcuts, and an inspector Compare button.

## 简体中文

**名称：** Video Grid Comparator

**简短描述**（不超过 100 字）：

> 并排同步播放 2–4 个选中的视频：共享时间轴、同步缩放与平移，检查器中一键开始对比。

**介绍：**

> Video Grid Comparator 可以把 Eagle 资源库中的 2–4 个视频并排放在一起，用同一组播放控制同步播放。适合挑选镜头、对比调色版本或逐帧检查剪辑。
>
> **使用方法**
> 1. 在 Eagle 中选中 2–4 个视频。
> 2. 点击检查器中的 **Compare** 按钮，或从“插件”菜单运行 Video Grid Comparator。
> 3. 使用共享控制栏对比视频，按 Esc 关闭。
>
> **功能**
> - 2 或 3 个视频横向排列，4 个视频以 2×2 网格显示。
> - 所有视频共用一条时间轴、播放/暂停、速度（0.25×–2×）和循环。
> - 可选择播放哪一个视频的声音，或全部静音。
> - 鼠标滚轮缩放、拖动平移会同时作用于所有视频，方便查看同一处细节。
> - 3 个和 4 个视频时拖动时间轴依然流畅。
> - 快捷键：空格 播放/暂停，←/→ 跳转 1 秒，Shift+←/→ 跳转 0.1 秒，0 重置缩放，Home 回到开头，L 循环，M 静音，1–4 选择声音来源。
> - 跟随 Eagle 的浅色和深色主题。
>
> **格式：** 支持 MP4、MOV、M4V、WebM、MKV、AVI、WMV、MPG、MPEG、M2TS 和 TS 项目。能否播放取决于 Eagle 内置浏览器的解码能力，H.264 编码的 MP4 最稳定。无法解码的视频会在对应画面中提示。
>
> **文件与隐私：** 插件只读取选中的项目，并直接播放本地文件。不会修改、移动、复制或上传任何文件，也不连接互联网。从检查器打开时，插件会请求本机的 Eagle 应用（127.0.0.1）打开本插件；如果不可用，会在系统临时文件夹写入一个很小的启动请求（仅包含 ID 和时间戳）。
>
> 免费开源，采用 MIT 许可证。

**本版本更新说明：**

> 首次发布：2–4 个视频同步播放，共享时间轴、速度、循环和声音来源，同步缩放与平移，快捷键，以及检查器中的 Compare 按钮。

## Submission notes

- **Category keywords:** video, compare, sync, grid (from `manifest.json`).
- **Contact:** https://github.com/Opus721/eagle-video-grid-comparator/issues
- **Plugin website:** https://github.com/Opus721/eagle-video-grid-comparator
- **Review notes:** no account, key, or external service is needed. Select 2–4 local MP4/H.264 videos and press Compare in the inspector.
