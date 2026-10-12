import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import AI_runtime_class from './../../libs/ai-runtime.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

//license and size: see MODELS.md
const MODEL = 'Xenova/swin2SR-lightweight-x2-64';
//image is upscaled in tiles to keep memory flat. Each tile carries a margin that is thrown away, so no seams.
const TILE = 192;
const MARGIN = 16;
//longest side that finishes in about a minute, per backend (measured: about 1.3 s per tile on WebGPU, 3.7 s on WASM)
const MAX_SIZE = {webgpu: 1280, wasm: 768};

/**
 * AI > Upscale 2x. Doubles the resolution of the active layer with a super-resolution model.
 */
class AI_upscale_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
		this.AI = new AI_runtime_class();
	}

	upscale() {
		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}
		var layer = config.layer;
		var source = this.Base_layers.convert_layer_to_canvas(layer.id, true);

		return this.AI.run('Upscaling', async () => {
			var device = await this.AI.get_device();
			if (Math.max(source.width, source.height) > MAX_SIZE[device]) {
				alertify.error('Image is too large to upscale here: the longest side can be ' + MAX_SIZE[device] + ' px'
					+ (device == 'wasm' ? ' without WebGPU' : '') + '. Use Image > Resize first.');
				return;
			}

			var upscaler = await this.AI.load_model(MODEL, function (T, id, options) {
				return T.pipeline('image-to-image', id, {...options, dtype: 'fp32'});
			});
			var canvas = await this.upscale_canvas(source, upscaler);

			var actions = [
				new app.Actions.Update_layer_image_action(canvas, layer.id),
				new app.Actions.Update_layer_action(layer.id, {
					width: layer.width * 2,
					height: layer.height * 2,
					width_original: canvas.width,
					height_original: canvas.height,
				}),
			];
			//grow canvas if the layer does not fit anymore
			var width = Math.max(config.WIDTH, layer.x + layer.width * 2);
			var height = Math.max(config.HEIGHT, layer.y + layer.height * 2);
			if (width != config.WIDTH || height != config.HEIGHT) {
				actions.push(
					new app.Actions.Prepare_canvas_action('undo'),
					new app.Actions.Update_config_action({
						WIDTH: width,
						HEIGHT: height,
					}),
					new app.Actions.Prepare_canvas_action('do')
				);
			}
			await app.State.do_action(
				new app.Actions.Bundle_action('ai_upscale', 'Upscale 2x', actions)
			);
		});
	}

	/**
	 * @param {canvas} source
	 * @param {function} upscaler image-to-image pipeline
	 * @returns {canvas} twice the size
	 */
	async upscale_canvas(source, upscaler) {
		var RawImage = this.AI.transformers.RawImage;
		var w = source.width;
		var h = source.height;

		var result = document.createElement('canvas');
		result.width = w * 2;
		result.height = h * 2;
		var result_ctx = result.getContext('2d');

		var tile = document.createElement('canvas');
		var tile_ctx = tile.getContext('2d', {willReadFrequently: true});
		var total = Math.ceil(w / TILE) * Math.ceil(h / TILE);
		var done = 0;

		for (var y = 0; y < h; y += TILE) {
			for (var x = 0; x < w; x += TILE) {
				this.AI.show_progress('Upscaling', done / total * 100);

				//tile with margin, clamped to the image
				var x1 = Math.max(0, x - MARGIN);
				var y1 = Math.max(0, y - MARGIN);
				var x2 = Math.min(w, x + TILE + MARGIN);
				var y2 = Math.min(h, y + TILE + MARGIN);
				tile.width = x2 - x1;
				tile.height = y2 - y1;
				//transparent pixels would turn black, white is the safer guess next to edges
				tile_ctx.fillStyle = '#ffffff';
				tile_ctx.fillRect(0, 0, tile.width, tile.height);
				tile_ctx.drawImage(source, -x1, -y1);

				var output = await upscaler(RawImage.fromCanvas(tile));
				var big = output.rgba().toCanvas();

				//copy without the margin
				var core_w = Math.min(TILE, w - x);
				var core_h = Math.min(TILE, h - y);
				result_ctx.drawImage(big,
					(x - x1) * 2, (y - y1) * 2, core_w * 2, core_h * 2,
					x * 2, y * 2, core_w * 2, core_h * 2);
				done++;
			}
		}

		//model works on colors only, transparency is scaled the plain way
		result_ctx.globalCompositeOperation = 'destination-in';
		result_ctx.drawImage(source, 0, 0, w * 2, h * 2);

		return result;
	}

}

export default AI_upscale_class;
