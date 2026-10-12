# Architecture

GlassPaint is miniPaint (webpack 5, plain ES classes, jQuery for a few widgets) with extra modules. Nothing in the upstream core was rewritten; new features are added the same way upstream adds its own.

## Layout

| Path | What lives there |
|---|---|
| `index.html` | Static shell: menu bar, tool sidebar, canvas, right panels, `#popups`. |
| `src/js/main.js` | Entry. Imports the CSS, creates the singletons and puts them on `app` (`src/js/app.js`) and `window`. |
| `src/js/config.js` | Global state (`config.layers`, `config.layer`, `config.ZOOM`, ...) and the tool list `config.TOOLS`. |
| `src/js/config-menu.js` | The whole menu bar as one nested array. |
| `src/js/core/` | Layers and rendering (`base-layers.js`), undo (`base-state.js`), tool base class, selection, GUI panels (`core/gui/`). |
| `src/js/modules/<menu>/` | One class per menu action. Loaded automatically. |
| `src/js/tools/` | One class per sidebar tool. Loaded automatically. |
| `src/js/actions/` | Undoable actions. Every change to layers goes through one. |
| `src/js/libs/` | Helpers, `popup.js` (dialogs), image filter libraries, `ai-runtime.js`. |
| `src/css/` | Upstream styles plus `glass.css` (the whole GlassPaint theme). |

## How things are registered

Modules and tools are picked up with `require.context`, so there is no registry file to edit.

- `Base_gui_class.load_modules()` in `src/js/core/base-gui.js` instantiates every file under `src/js/modules/`. The key is the path without `.js`, for example `ai/remove_background`.
- `GUI_tools_class.load_plugins()` in `src/js/core/gui/gui-tools.js` does the same for `src/js/tools/`.
- A menu entry with `target: 'ai/remove_background.remove_background'` calls `modules['ai/remove_background'].remove_background()`.

## Add a menu item

1. Add `{ name: 'My Thing', ellipsis: true, target: 'image/my_thing.my_thing' }` to `src/js/config-menu.js`.
2. Create `src/js/modules/image/my_thing.js` exporting a default class with a `my_thing()` method.

## Add a filter

Two kinds exist upstream.

- **Pixel filter (destructive).** Copy `src/js/modules/effects/sharpen.js`. Get the layer as a canvas with `Base_layers.convert_layer_to_canvas(null, true)`, change the pixels, then `app.State.do_action(new app.Actions.Update_layer_image_action(canvas))`. `src/js/modules/image/white_balance.js` is a GlassPaint example.
- **CSS filter (non-destructive, stored on the layer).** Copy `src/js/modules/effects/common/blur.js`, which extends `effects/abstract/css.js` and saves through `Add_layer_filter_action`.

Add a `demo(canvas_id, canvas_thumb)` method if the filter should appear in Effects > Effect browser.

## Add a dialog

`src/js/libs/popup.js` builds dialogs from a settings object:

```js
this.POP.show({
	title: 'My Thing',
	preview: true,
	params: [
		{name: 'amount', title: 'Amount:', value: 5, range: [0, 50]},
		{name: 'mode', title: 'Mode:', values: ['A', 'B'], value: 'A', type: 'select'},
	],
	on_change: function (params, canvas_preview, w, h) { /* draw the preview */ },
	on_finish: function (params) { /* apply */ },
});
```

Param types: text, number, `range`, `select`, checkbox (boolean `value`), `color`, `textarea`, raw `html`, or a `function` that returns HTML.

## Add a tool

1. Add an entry to `config.TOOLS` in `src/js/config.js` (`name`, `attributes` shown in the top bar, optional `on_activate` / `on_leave` / `on_update` method names).
2. Create `src/js/tools/<name>.js` exporting a class that extends `Base_tools_class`, sets `this.name`, and registers its mouse listeners in `load()`. `src/js/tools/magic_erase.js` is the shortest upstream example; `src/js/tools/ai_select.js` is the GlassPaint one.
3. Add `images/icons/<name>.svg` and a `.sidebar_left .<name>:after` rule (GlassPaint keeps these in `src/css/glass.css`).
4. Optional: a `render(ctx, layer)` method if the tool draws its own layer type, and `render_overlay(ctx)` for on-canvas guides.

## Undo and redo

`app.State.do_action(action)` runs an action and pushes it on `State.action_history`. Actions implement `do()`, `undo()` and `free()`. To make several changes undo as one step, wrap them: `new app.Actions.Bundle_action('id', 'Label', [action1, action2])`. The History panel (`src/js/core/gui/gui-history.js`) only reads `action_history` and `action_history_index`.

## AI features

`src/js/libs/ai-runtime.js` lazy-loads Transformers.js in its own webpack chunk, picks WebGPU or WASM, and shows the download progress bar. Each feature is a module in `src/js/modules/ai/`. Models, licences and sizes are in `MODELS.md`.

## Theme

All GlassPaint styling is in `src/css/glass.css`, driven by the CSS variables at the top of that file. The refraction filter is the inline SVG at the bottom of `index.html`.
