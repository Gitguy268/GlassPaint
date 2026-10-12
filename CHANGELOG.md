# Changelog

GlassPaint starts from miniPaint 4.14.3 (commit `a79733e`). Upstream history: https://github.com/viliusle/miniPaint/releases

## Unreleased

### Added
- Liquid Glass interface: translucent menus, toolbar, panels, dialogs and notifications with blur, saturation, specular edges and inner shadows. All of it is in `src/css/glass.css` and driven by CSS variables.
- Refraction along the rim of the toolbar and dialogs (`src/js/libs/glass.js`, SVG displacement map in `backdrop-filter`). Chromium only; Firefox and Safari get plain blur.
- Theme `auto` (new default) follows the system light/dark setting. `dark`, `light` and `green` remain.
- Opaque panels under `prefers-reduced-transparency`, no transitions under `prefers-reduced-motion`.
- AI menu with Remove Background: runs U-2-Netp (5 MB) or IS-Net (179 MB) in the browser, feather and decontaminate sliders, outputs a cut-out and a mask layer as one undo step.
- AI > Select Object (tool in the sidebar): click an object to get its mask with SlimSAM, Shift+click adds a point, Alt+click excludes one. Cut the object out to a new layer or pass its bounding box to the selection tool.
- AI > Upscale 2x: Swin2SR super-resolution, processed in tiles. Up to 1280 px with WebGPU, 768 px with WebAssembly.
- PSD import (upstream issue #165): open or drop a `.psd` and each layer with pixels becomes an image layer with its name, position, opacity, visibility and blend mode. Uses `ag-psd` (MIT), downloaded only when a PSD is opened. Import only.
- Tool settings (brush size, pressure, eraser shape and so on) are remembered between visits (upstream issue #368).
- Image > White Balance (upstream issue #319): automatic (grey world), from a picked color that should be neutral, or by hand with temperature and tint.
- `MODELS.md` with every model's source, licence and size.
- AI runtime (`src/js/libs/ai-runtime.js`): Transformers.js loaded on first use, WebGPU with WebAssembly fallback, download progress bar, models cached by the browser.
- About dialog credits miniPaint.
- `ARCHITECTURE.md`, `PLAN.md`, this changelog.
- Playwright as a dev dependency.

### Changed
- Renamed to GlassPaint (page title, logo, package name). Version is 5.0.0: saved JSON files carry the version and are compared with miniPaint's numbers, so it continues from 4.14.3.
- webpack `publicPath` is `auto`, so the build works from any sub-path.
- `dist/` is no longer committed; run `npm run build`.

- Default drawing color is black instead of dark green, as suggested in upstream issue #372. The last used color is still remembered.

### Measured
- Zoom and pan on a 4000x3000 image in headless Chromium: median frame 16.7 ms and no frame over 33 ms, with the glass theme on and with it removed.
