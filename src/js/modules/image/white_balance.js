import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import Helper_class from './../../libs/helpers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * Image > White Balance. Removes a color cast: automatically, from a color the user says should be neutral,
 * or by hand with temperature and tint.
 */
class Image_white_balance_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.sources = ['Manual', 'Auto', 'Current color is neutral'];
	}

	white_balance() {
		var _this = this;

		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}

		var settings = {
			title: 'White Balance',
			preview: true,
			comment: 'Tip: pick a spot that should be white or grey with the color picker first.',
			params: [
				{name: "source", title: "Correction:", type: "select", values: this.sources, value: this.sources[0]},
				{name: "temperature", title: "Temperature:", value: 0, range: [-100, 100]},
				{name: "tint", title: "Tint:", value: 0, range: [-100, 100]},
			],
			on_change: function (params, canvas_preview, w, h) {
				var img = canvas_preview.getImageData(0, 0, w, h);
				var data = _this.change(img, params);
				canvas_preview.putImageData(data, 0, 0);
			},
			on_finish: function (params) {
				_this.save(params);
			},
		};
		this.POP.show(settings);
	}

	save(params) {
		//get canvas from layer
		var canvas = this.Base_layers.convert_layer_to_canvas(null, true);
		var ctx = canvas.getContext("2d");

		//change data
		var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
		var data = this.change(img, params);
		ctx.putImageData(data, 0, 0);

		//save
		return app.State.do_action(
			new app.Actions.Bundle_action('white_balance', 'White Balance', [
				new app.Actions.Update_layer_image_action(canvas)
			])
		);
	}

	/**
	 * @param {ImageData} data
	 * @param {object} params {source, temperature, tint}
	 */
	change(data, params) {
		var imgData = data.data;
		var gain = this.get_gain(imgData, params);

		for (var i = 0; i < imgData.length; i += 4) {
			if (imgData[i + 3] == 0)
				continue;	//transparent
			imgData[i] = imgData[i] * gain[0];
			imgData[i + 1] = imgData[i + 1] * gain[1];
			imgData[i + 2] = imgData[i + 2] * gain[2];
		}

		return data;
	}

	/**
	 * returns multipliers for red, green and blue.
	 */
	get_gain(imgData, params) {
		var gain = [1, 1, 1];

		//color that should become neutral
		var cast = null;
		if (params.source == this.sources[1]) {
			//"grey world": on average a photo is grey
			var sum = [0, 0, 0];
			for (var i = 0; i < imgData.length; i += 4) {
				if (imgData[i + 3] == 0)
					continue;	//transparent
				sum[0] += imgData[i];
				sum[1] += imgData[i + 1];
				sum[2] += imgData[i + 2];
			}
			cast = sum;
		}
		else if (params.source == this.sources[2]) {
			var rgb = this.Helper.hexToRgb(config.COLOR);
			cast = [rgb.r, rgb.g, rgb.b];
		}
		if (cast && cast[0] > 0 && cast[1] > 0 && cast[2] > 0) {
			var grey = 0.299 * cast[0] + 0.587 * cast[1] + 0.114 * cast[2];
			gain = [grey / cast[0], grey / cast[1], grey / cast[2]];
		}

		//warmer = more red, less blue. Tint moves between green and magenta.
		var temperature = parseInt(params.temperature) / 100 * 0.4;
		var tint = parseInt(params.tint) / 100 * 0.4;
		gain[0] *= 1 + temperature;
		gain[2] *= 1 - temperature;
		gain[1] *= 1 - tint;

		//keep brightness
		var brightness = 0.299 * gain[0] + 0.587 * gain[1] + 0.114 * gain[2];
		return [gain[0] / brightness, gain[1] / brightness, gain[2] / brightness];
	}

}

export default Image_white_balance_class;
