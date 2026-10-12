# GlassPaint plan

A 6-hour remix of [miniPaint](https://github.com/viliusle/miniPaint) 4.14.3. This file records what was planned, what was picked from the upstream issue tracker and why, what was cut, and the decisions made along the way.

## Time budget

| Step | Work | Budget |
|---|---|---|
| 0 | Clone, build, read the code, write this plan | 20 min |
| 0.5 | Spike: does Transformers.js bundle and run under this webpack setup? | 15 min |
| 1 | Liquid Glass UI | 75 min |
| 2 | AI features (background remover, select object, upscale) | 105 min |
| 3 | Community-requested features | 90 min |
| 4 | Tests, README, production build | 45 min |

## Upstream feature requests

The tracker has very little reaction data: of 44 open issues, one has 4 👍, three have 1 and the rest have none. The ranking below is by 👍 first, then by number of comments, feature requests only (data read 2026-10-12).

| # | Issue | 👍 | Comments | Verdict |
|---|---|---|---|---|
| 1 | #312 More selection tools, add/subtract selection | 4 | 2 | Partly: AI Select Object. Full version cut, see below. |
| 2 | #425 Custom session parameters | 1 | 0 | Not picked: embedding API, unclear scope. |
| 3 | #185 Text tool improvements | 0 | 21 | Not picked: many separate wishes, each touching the text renderer. |
| 4 | #179 Pen pressure | 0 | 17 | Already upstream (brush and pencil have a Pressure option). |
| 5 | #287 Bounding boxes and rasterised layers | 0 | 16 | Not picked: changes core layer geometry. |
| 6 | #165 PSD import and export | 0 | 14 | **Picked** (import only). |
| 7 | #353 Effects in linear RGB | 0 | 9 | Not picked: touches every filter. |
| 8 | #338 Rendering quality | 0 | 9 | Not picked: render pipeline. |
| 9 | #263 Lag | 0 | 4 | Not picked: profiling work, not a feature. |
| 10 | #366 Pan | 0 | 3 | Not picked. |
| 11 | #368 Brush size is not remembered on refresh | 0 | 2 | **Picked.** |
| 12 | #372 Default colour value | 0 | 2 | **Picked** (same change as #368). |
| 13 | #362 Inserting an image resizes the canvas | 0 | 2 | Already a setting upstream (Enable autoresize). |
| 14 | #319 White balance | 0 | 2 | **Picked.** |
| 15 | #195 AVIF | 0 | 2 | Opening AVIF already works upstream; browsers cannot encode it from a canvas. |

### Picks

| Feature | Why | Estimate |
|---|---|---|
| PSD import (#165) | Most-discussed request that fits. `ag-psd` (MIT) does the parsing and is loaded only when a `.psd` is opened. Layers come in with name, position, opacity and visibility. | 30 min |
| Remember tool settings and colour (#368, #372) | Small, self-contained, two issues at once. | 20 min |
| White balance (#319) | Follows the existing filter pattern exactly, so low risk. | 20 min |
| Undo history panel | Not an upstream issue; it was on the brief's example list. The undo system already stores named actions, so the panel only has to show them. | 20 min |

### Not picked from the brief's examples

| Example | Reason |
|---|---|
| Keyboard shortcut customisation | Shortcuts are hard-coded `keydown` listeners in about ten module constructors. Making them configurable means rewriting all of them. |
| Layer masks | Needs a change to the layer render pipeline. |
| HEIC | Needs a HEVC decoder (libheif build, about 1 MB, LGPL plus patent questions). |
| Proper dark mode | Done as part of Step 1 (theme `auto` follows the system setting). |

## Scope cuts

- **Select Object returns a rectangle plus a cut-out, not a freeform selection.** miniPaint's selection is `{x, y, width, height}`; delete and copy work on that rectangle. A pixel-mask selection would mean rewriting selection, copy, delete and crop. Select Object shows the mask, sets the selection to its bounding box and can cut the object out to a new layer. The same limit rules out #312's add/subtract.
- **Upscale is limited in input size.** A 2x upscale of a 4000x3000 image in a browser tab would stall or run out of memory.
- **Auto-enhance and Remove Object (inpainting) are not built** unless time is left over. miniPaint already has Auto Adjust Colors and Content Fill.

## Decisions log

- Work is local only. `gh` was not logged in and publishing is the owner's call. Remote `upstream` points at viliusle/miniPaint.
- Upstream's Pixabay and Google Fonts keys in `src/js/config.js` are left as they are. They are upstream's public client-side keys; removing them breaks Search Images and the font list. Flagged to the owner.
- `dist/` is no longer committed. Build it with `npm run build`.
- No service worker. "Works offline after the first download" means the AI models need no network once cached; the app files still have to be served from somewhere.
- WASM runs single-threaded on hosts that cannot send cross-origin isolation headers (GitHub Pages). WebGPU is the fast path.
- Models are always requested by explicit ID. Not used: `@imgly/background-removal` (AGPL), BRIA RMBG (non-commercial), `onnx-community/ISNet-ONNX` (AGPL-3.0).
