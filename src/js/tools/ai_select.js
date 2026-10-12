import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import GUI_tools_class from './../core/gui/gui-tools.js';
import AI_runtime_class from './../libs/ai-runtime.js';
import AI_remove_background_class from './../modules/ai/remove_background.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

//license and size: see MODELS.md
const MODEL = 'Xenova/slimsam-77-uniform';

/**
 * Click an object to select it (Segment Anything). Shift+click adds a point, Alt+click excludes one.
 * The found object can be cut out to a new layer or handed to the selection tool as a bounding box:
 * selections in this editor are rectangles, so there is no freeform selection to give it to.
 */
class Ai_select_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.GUI_tools = new GUI_tools_class();
		this.AI = new AI_runtime_class();
		this.Remove_background = new AI_remove_background_class();
		this.ctx = ctx;
		this.name = 'ai_select';
		this.image = null;	//analyzed layer: {layer_id, src, full, inputs, embeddings}
		this.points = [];	//clicks: {x, y, label}, x and y are 0-1 inside the layer
		this.mask = null;	//canvas, object in alpha channel
		this.box = null;	//object bounds in mask pixels: {x, y, width, height}
		this.overlay = null;
	}

	dragStart(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		_this.mousedown(event);
	}

	load() {
		var _this = this;

		//mouse events
		document.addEventListener('mousedown', function (event) {
			_this.dragStart(event);
		});

		// collect touch events
		document.addEventListener('touchstart', function (event) {
			_this.dragStart(event);
		});
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			return;
		}
		var layer = config.layer;
		if (layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}
		if (layer.rotate || 0 > 0) {
			alertify.error('Select Object on rotated layer is disabled. Please rasterize first.');
			return;
		}

		var x = (mouse.x - layer.x) / layer.width;
		var y = (mouse.y - layer.y) / layer.height;
		if (x < 0 || x > 1 || y < 0 || y > 1) {
			return;
		}
		if (!e.shiftKey && !e.altKey) {
			this.points = [];
		}
		this.points.push({x: x, y: y, label: e.altKey ? 0 : 1});

		this.select_object(layer);
	}

	select_object(layer) {
		return this.AI.run('Selecting object', async () => {
			var sam = await this.AI.load_model(MODEL, async function (T, id, options) {
				return {
					//8-bit weights are the fast ones without a GPU, but WebGPU needs floats
					model: await T.SamModel.from_pretrained(id, {...options, dtype: options.device == 'webgpu' ? 'fp32' : 'q8'}),
					processor: await T.AutoProcessor.from_pretrained(id),
				};
			});
			var T = this.AI.transformers;
			this.AI.show_progress('Selecting object');

			//the slow part, once per image
			if (!this.image || this.image.layer_id != layer.id || this.image.src != layer.link.src) {
				var full = this.Base_layers.convert_layer_to_canvas(layer.id, true);
				//model looks at 1024 px, more only costs memory
				var scale = Math.min(1, 1024 / Math.max(full.width, full.height));
				var small = document.createElement('canvas');
				small.width = Math.round(full.width * scale);
				small.height = Math.round(full.height * scale);
				small.getContext('2d').drawImage(full, 0, 0, small.width, small.height);

				var inputs = await sam.processor(T.RawImage.fromCanvas(small));
				var embeddings = await sam.model.get_image_embeddings(inputs);
				this.image = {layer_id: layer.id, src: layer.link.src, full: full, inputs: inputs, embeddings: embeddings};
			}

			//the fast part, on every click
			var inputs = this.image.inputs;
			var reshaped = inputs.reshaped_input_sizes[0];
			var coords = [];
			var labels = [];
			for (var point of this.points) {
				coords.push(point.x * reshaped[1], point.y * reshaped[0]);
				labels.push(BigInt(point.label));
			}
			var output = await sam.model({
				...this.image.embeddings,
				input_points: new T.Tensor('float32', Float32Array.from(coords), [1, 1, this.points.length, 2]),
				input_labels: new T.Tensor('int64', BigInt64Array.from(labels), [1, 1, this.points.length]),
			});
			var masks = await sam.processor.post_process_masks(output.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);

			//model proposes 3 masks with a confidence each. Near ties go to the smallest one,
			//the larger one is usually the same object plus pieces of background
			var scores = output.iou_scores.data;
			var pixels = masks[0].dims[2] * masks[0].dims[3];
			var top_score = Math.max(...scores);
			var best = 0;
			var best_area = Infinity;
			for (var i = 0; i < scores.length; i++) {
				if (scores[i] < top_score - 0.03) {
					continue;
				}
				var area = 0;
				for (var j = 0; j < pixels; j++) {
					area += masks[0].data[i * pixels + j];
				}
				if (area < best_area) {
					best = i;
					best_area = area;
				}
			}
			this.set_mask(masks[0], best);
			config.need_render = true;
		});
	}

	/**
	 * @param {Tensor} tensor [1, 3, height, width], 1 = object
	 * @param {int} index which of the 3 masks
	 */
	set_mask(tensor, index) {
		var h = tensor.dims[2];
		var w = tensor.dims[3];
		var offset = index * w * h;

		//keep only the parts connected to a click, the model also marks loose specks elsewhere
		var keep = new Uint8Array(w * h);
		var queue = [];
		for (var point of this.points) {
			var start = Math.min(h - 1, Math.floor(point.y * h)) * w + Math.min(w - 1, Math.floor(point.x * w));
			if (point.label && tensor.data[offset + start] && !keep[start]) {
				keep[start] = 1;
				queue.push(start);
			}
		}
		var found_click = queue.length > 0;
		while (queue.length) {
			var pos = queue.pop();
			var x = pos % w;
			var next = [pos - w, pos + w, x > 0 ? pos - 1 : -1, x < w - 1 ? pos + 1 : -1];
			for (var n of next) {
				if (n >= 0 && n < w * h && !keep[n] && tensor.data[offset + n]) {
					keep[n] = 1;
					queue.push(n);
				}
			}
		}

		var canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		var ctx = canvas.getContext('2d');
		var img = ctx.createImageData(w, h);
		var left = w, top = h, right = -1, bottom = -1;
		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				if (found_click ? !keep[y * w + x] : !tensor.data[offset + y * w + x]) {
					continue;
				}
				var i = (y * w + x) * 4;
				img.data[i] = img.data[i + 1] = img.data[i + 2] = img.data[i + 3] = 255;
				left = Math.min(left, x);
				right = Math.max(right, x);
				top = Math.min(top, y);
				bottom = Math.max(bottom, y);
			}
		}
		if (right < 0) {
			this.clear();
			alertify.error('Nothing found there.');
			return;
		}
		ctx.putImageData(img, 0, 0);
		this.mask = canvas;
		this.box = {x: left, y: top, width: right - left + 1, height: bottom - top + 1};

		//highlight
		this.overlay = document.createElement('canvas');
		this.overlay.width = w;
		this.overlay.height = h;
		var overlay_ctx = this.overlay.getContext('2d');
		overlay_ctx.drawImage(canvas, 0, 0);
		overlay_ctx.globalCompositeOperation = 'source-in';
		overlay_ctx.fillStyle = '#0a84ff';
		overlay_ctx.fillRect(0, 0, w, h);
	}

	clear() {
		this.points = [];
		this.mask = null;
		this.box = null;
		this.overlay = null;
		config.need_render = true;
	}

	render_overlay(ctx) {
		var layer = config.layer;
		if (!this.overlay || !this.image || layer.id != this.image.layer_id) {
			return;
		}

		ctx.save();
		ctx.globalAlpha = 0.45;
		ctx.drawImage(this.overlay, layer.x, layer.y, layer.width, layer.height);
		ctx.globalAlpha = 1;

		//bounds
		var scale_x = layer.width / this.mask.width;
		var scale_y = layer.height / this.mask.height;
		ctx.lineWidth = 1 / config.ZOOM;
		ctx.setLineDash([4 / config.ZOOM, 4 / config.ZOOM]);
		ctx.strokeStyle = '#ffffff';
		ctx.strokeRect(layer.x + this.box.x * scale_x, layer.y + this.box.y * scale_y,
			this.box.width * scale_x, this.box.height * scale_y);

		//clicks
		ctx.setLineDash([]);
		for (var point of this.points) {
			ctx.beginPath();
			ctx.arc(layer.x + point.x * layer.width, layer.y + point.y * layer.height, 5 / config.ZOOM, 0, 2 * Math.PI);
			ctx.fillStyle = point.label ? '#30d158' : '#ff453a';
			ctx.fill();
			ctx.stroke();
		}
		ctx.restore();
	}

	/**
	 * buttons in tool attributes
	 */
	on_params_update(data) {
		if (data.key != 'cut_out' && data.key != 'box_select') {
			return;
		}
		//they are buttons, not switches
		config.TOOL.attributes[data.key] = true;
		this.GUI_tools.show_action_attributes();

		var layer = config.layer;
		if (!this.mask || !this.image || layer.id != this.image.layer_id) {
			alertify.error('Click an object first.');
			return;
		}
		if (data.key == 'cut_out') {
			this.cut_out(layer);
		}
		else {
			this.box_select(layer);
		}
	}

	/**
	 * copies the object to a new layer, original layer stays.
	 */
	cut_out(layer) {
		var full = this.image.full;
		var params = this.getParams();
		var result = this.Remove_background.apply_mask(full, this.mask, full.width, full.height, params.feather, 50);

		//only the part with the object
		var scale = full.width / this.mask.width;
		var margin = Math.ceil(params.feather * 2);
		var x = Math.max(0, Math.floor(this.box.x * scale) - margin);
		var y = Math.max(0, Math.floor(this.box.y * scale) - margin);
		var w = Math.min(full.width - x, Math.ceil(this.box.width * scale) + margin * 2);
		var h = Math.min(full.height - y, Math.ceil(this.box.height * scale) + margin * 2);
		var canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		canvas.getContext('2d').drawImage(result.image, -x, -y);

		var ratio_x = layer.width / full.width;
		var ratio_y = layer.height / full.height;
		this.clear();

		return app.State.do_action(
			new app.Actions.Bundle_action('ai_cut_out', 'Cut Out Object', [
				new app.Actions.Insert_layer_action({
					name: layer.name + ' object',
					type: 'image',
					data: canvas.toDataURL('image/png'),
					x: Math.round(layer.x + x * ratio_x),
					y: Math.round(layer.y + y * ratio_y),
					width: Math.round(w * ratio_x),
					height: Math.round(h * ratio_y),
					width_original: w,
					height_original: h,
				}, false)
			])
		);
	}

	/**
	 * gives object bounds to the selection tool.
	 */
	box_select(layer) {
		var scale_x = layer.width / this.mask.width;
		var scale_y = layer.height / this.mask.height;
		var box = this.box;
		this.clear();

		return app.State.do_action(
			new app.Actions.Bundle_action('ai_box_select', 'Select Object', [
				new app.Actions.Activate_tool_action('selection'),
				new app.Actions.Set_selection_action(
					Math.round(layer.x + box.x * scale_x),
					Math.round(layer.y + box.y * scale_y),
					Math.round(box.width * scale_x),
					Math.round(box.height * scale_y)
				)
			])
		);
	}

	on_leave() {
		this.clear();
	}

}

export default Ai_select_class;
