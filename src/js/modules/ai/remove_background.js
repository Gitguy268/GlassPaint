import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import AI_runtime_class from './../../libs/ai-runtime.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

var instance = null;

/**
 * AI > Remove Background. Runs a salient object model in the browser, turns the layer into a cut-out
 * and adds the mask as a second layer.
 */
class AI_remove_background_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.AI = new AI_runtime_class();

		//licenses and sizes: see MODELS.md
		this.models = {
			'Fast (5 MB)': {
				id: 'BritishWerewolf/U-2-Netp',
				size: 320,
				mean: [0.485, 0.456, 0.406],
				std: [0.229, 0.224, 0.225],
			},
			'Quality (179 MB)': {
				id: 'BritishWerewolf/IS-Net',
				size: 1024,
				mean: [0.485, 0.456, 0.406],
				std: [1, 1, 1],
			},
		};
		this.mask = null;
		this.mask_model = null;
		this.detecting = null;
	}

	remove_background() {
		var _this = this;

		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}

		var source = this.Base_layers.convert_layer_to_canvas(null, true);
		var layer_id = config.layer.id;
		this.mask = null;
		this.mask_model = null;

		var settings = {
			title: 'Remove Background',
			preview: true,
			params: [
				{name: "model", title: "Model:", type: "select", values: Object.keys(this.models), value: Object.keys(this.models)[0]},
				{name: "feather", title: "Feather:", value: 1, range: [0, 20]},
				{name: "decontaminate", title: "Decontaminate:", value: 50, range: [0, 100]},
				{name: "mask_layer", title: "Add mask layer:", value: true},
			],
			on_change: function (params, canvas_preview, w, h) {
				if (params.model != _this.mask_model) {
					_this.detect(source, params.model).then(function () {
						if (_this.POP.active) {
							_this.POP.preview_handler();
						}
					});
					return;
				}
				if (_this.mask) {
					var result = _this.apply_mask(source, _this.mask, w, h, params.feather * w / source.width, params.decontaminate);
					canvas_preview.clearRect(0, 0, w, h);
					canvas_preview.drawImage(result.image, 0, 0);
				}
			},
			on_finish: function (params) {
				_this.save(source, layer_id, params);
			},
		};
		this.POP.show(settings);
	}

	/**
	 * finds the foreground of the image. Result is stored in this.mask.
	 *
	 * @param {canvas} source
	 * @param {string} model_name key of this.models
	 */
	detect(source, model_name) {
		this.mask = null;
		this.mask_model = model_name;
		this.detecting = this.AI.run('Finding the subject', async () => {
			var mask = await this.get_mask(source, model_name);
			if (this.mask_model == model_name) {
				this.mask = mask;
			}
		});
		return this.detecting;
	}

	/**
	 * runs the model.
	 *
	 * @param {canvas} source
	 * @param {string} model_name key of this.models
	 * @returns {canvas} model sized canvas, white, foreground probability in alpha channel
	 */
	async get_mask(source, model_name) {
		var info = this.models[model_name];
		var size = info.size;
		var model = await this.AI.load_model(info.id, function (T, id, options) {
			return T.AutoModel.from_pretrained(id, {...options, dtype: 'fp32'});
		});
		this.AI.show_progress('Finding the subject');
		await this.AI.next_frame();

		//image to normalized float tensor
		var canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		var ctx = canvas.getContext('2d', {willReadFrequently: true});
		ctx.drawImage(source, 0, 0, size, size);
		var img = ctx.getImageData(0, 0, size, size);
		var pixels = size * size;
		var input = new Float32Array(3 * pixels);
		for (var i = 0; i < pixels; i++) {
			for (var c = 0; c < 3; c++) {
				input[c * pixels + i] = (img.data[i * 4 + c] / 255 - info.mean[c]) / info.std[c];
			}
		}

		var session = model.sessions.model;
		var tensor = new this.AI.transformers.Tensor('float32', input, [1, 3, size, size]);
		var output = await model({[session.inputNames[0]]: tensor});
		var prediction = output[session.outputNames[0]].data;

		//stretch prediction to 0-255, same as the reference implementation (rembg)
		var min = Infinity;
		var max = -Infinity;
		for (var i = 0; i < pixels; i++) {
			min = Math.min(min, prediction[i]);
			max = Math.max(max, prediction[i]);
		}
		var range = (max - min) || 1;
		for (var i = 0; i < pixels; i++) {
			img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
			img.data[i * 4 + 3] = (prediction[i] - min) / range * 255;
		}
		ctx.putImageData(img, 0, 0);

		return canvas;
	}

	/**
	 * cuts image by mask, with edge refinement.
	 *
	 * @param {canvas} source image
	 * @param {canvas} mask any size, foreground in alpha channel
	 * @param {int} w result width
	 * @param {int} h result height
	 * @param {number} feather edge blur radius in result pixels
	 * @param {number} decontaminate 0-100, how much background color is removed from soft edges
	 * @returns {object} {image: canvas, mask: canvas} - mask is opaque, white = kept
	 */
	apply_mask(source, mask, w, h, feather, decontaminate) {
		var new_canvas = function () {
			var canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			return canvas;
		};

		//mask in result size
		var alpha = new_canvas();
		var alpha_ctx = alpha.getContext('2d');
		if (feather > 0) {
			alpha_ctx.filter = 'blur(' + feather + 'px)';
		}
		alpha_ctx.drawImage(mask, 0, 0, w, h);
		alpha_ctx.filter = 'none';

		//cut
		var image = new_canvas();
		var ctx = image.getContext('2d', {willReadFrequently: true});
		ctx.drawImage(source, 0, 0, w, h);
		ctx.globalCompositeOperation = 'destination-in';
		ctx.drawImage(alpha, 0, 0);
		ctx.globalCompositeOperation = 'source-over';

		if (decontaminate > 0) {
			//average color of the nearby solid foreground: blur of the image cut by a hard mask
			var solid = new_canvas();
			var solid_ctx = solid.getContext('2d', {willReadFrequently: true});
			solid_ctx.drawImage(image, 0, 0);
			var solid_img = solid_ctx.getImageData(0, 0, w, h);
			for (var i = 3; i < solid_img.data.length; i += 4) {
				solid_img.data[i] = solid_img.data[i] > 230 ? 255 : 0;
			}
			solid_ctx.putImageData(solid_img, 0, 0);
			var near = new_canvas();
			var near_ctx = near.getContext('2d', {willReadFrequently: true});
			near_ctx.filter = 'blur(' + Math.max(2, feather * 2, w / 250) + 'px)';
			near_ctx.drawImage(solid, 0, 0);
			var near_data = near_ctx.getImageData(0, 0, w, h).data;

			//soft edge pixels take that color instead of the background color mixed into them
			var img = ctx.getImageData(0, 0, w, h);
			var data = img.data;
			var strength = decontaminate / 100;
			for (var i = 0; i < data.length; i += 4) {
				var a = data[i + 3];
				if (a == 0 || a > 230 || near_data[i + 3] < 8) {
					continue;
				}
				var mix = strength * (1 - a / 255);
				data[i] += (near_data[i] - data[i]) * mix;
				data[i + 1] += (near_data[i + 1] - data[i + 1]) * mix;
				data[i + 2] += (near_data[i + 2] - data[i + 2]) * mix;
			}
			ctx.putImageData(img, 0, 0);
		}

		//visible version of the mask: white on black
		var mask_canvas = new_canvas();
		var mask_ctx = mask_canvas.getContext('2d');
		mask_ctx.fillStyle = '#000000';
		mask_ctx.fillRect(0, 0, w, h);
		mask_ctx.drawImage(alpha, 0, 0);

		return {image: image, mask: mask_canvas};
	}

	async save(source, layer_id, params) {
		//OK can be pressed while the model is still downloading
		await this.detecting;
		if (!this.mask) {
			return;
		}
		var layer = this.Base_layers.get_layer(layer_id);
		var result = this.apply_mask(source, this.mask, source.width, source.height, params.feather, params.decontaminate);
		this.mask = null;

		var actions = [
			new app.Actions.Update_layer_image_action(result.image, layer_id),
		];
		if (params.mask_layer) {
			actions.push(
				new app.Actions.Insert_layer_action({
					name: layer.name + ' mask',
					type: 'image',
					data: result.mask.toDataURL('image/png'),
					x: layer.x,
					y: layer.y,
					width: layer.width,
					height: layer.height,
					width_original: source.width,
					height_original: source.height,
					visible: false,
				}, false),
				new app.Actions.Select_layer_action(layer_id)
			);
		}

		return app.State.do_action(
			new app.Actions.Bundle_action('remove_background', 'Remove Background', actions)
		);
	}

}

export default AI_remove_background_class;
