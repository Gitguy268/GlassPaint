/**
 * Runs AI models in the browser. Transformers.js (ONNX Runtime Web) is loaded on first use in its own chunk,
 * models are downloaded once and kept in the browser's Cache Storage.
 *
 * Usage:
 *
 * import AI_runtime_class from './libs/ai-runtime.js';
 * var AI = new AI_runtime_class();
 * var model = await AI.load_model('BritishWerewolf/U-2-Netp', (T, id, options) => T.AutoModel.from_pretrained(id, options));
 */
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

var instance = null;

class AI_runtime_class {

	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.transformers = null;
		this.device = null;
		this.models = {};
		this.busy = false;
	}

	/**
	 * returns "webgpu" or "wasm", throws if the browser has neither.
	 */
	async get_device() {
		if (this.device) {
			return this.device;
		}
		if (navigator.gpu) {
			try {
				if (await navigator.gpu.requestAdapter()) {
					this.device = 'webgpu';
				}
			} catch (error) {}
		}
		if (!this.device && typeof WebAssembly == 'object') {
			this.device = 'wasm';
		}
		if (!this.device) {
			throw new Error('AI features need WebGPU or WebAssembly, and this browser has neither.');
		}
		return this.device;
	}

	async load_library() {
		if (!this.transformers) {
			var T = await import(/* webpackChunkName: "ai" */ '@huggingface/transformers');
			T.env.allowLocalModels = false;
			//U2Net models have no class of their own in the library and load through the base class, which is fine
			T.env.logLevel = T.LogLevel.ERROR;
			//runtime files are emitted next to the bundle by webpack, not fetched from a CDN
			T.env.backends.onnx.wasm.wasmPaths = {
				mjs: new URL('./../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
				wasm: new URL('./../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href,
			};
			this.transformers = T;
		}
		return this.transformers;
	}

	/**
	 * loads model (once), shows download progress.
	 *
	 * @param {string} id Hugging Face model id
	 * @param {function} loader (transformers, id, options) => Promise
	 * @param {object} options extra options for from_pretrained()
	 */
	async load_model(id, loader, options = {}) {
		if (this.models[id]) {
			return this.models[id];
		}
		var device = await this.get_device();
		var T = await this.load_library();
		var settings = {
			...options,
			progress_callback: (info) => {
				if (info.status == 'progress_total') {
					this.show_progress('Downloading model', info.progress, info.total);
				}
			},
		};

		this.show_progress('Loading model');
		try {
			this.models[id] = await loader(T, id, {...settings, device: device});
		}
		catch (error) {
			if (device != 'webgpu') {
				throw error;
			}
			//graphics driver refused the model, the slower path still works
			console.warn('WebGPU failed, using WebAssembly.', error);
			this.device = 'wasm';
			this.models[id] = await loader(T, id, {...settings, device: 'wasm'});
		}
		return this.models[id];
	}

	/**
	 * runs AI task: one at a time, with progress bar and readable errors.
	 *
	 * @param {string} title
	 * @param {function} task async function
	 */
	async run(title, task) {
		if (this.busy) {
			alertify.error('Another AI task is still running.');
			return null;
		}
		this.busy = true;
		this.show_progress(title);
		try {
			return await task();
		}
		catch (error) {
			console.error(error);
			var offline = navigator.onLine === false || /fetch|network/i.test(error.message);
			alertify.error(offline
				? 'Could not download the AI model. It needs an internet connection the first time.'
				: 'AI task failed: ' + error.message);
			return null;
		}
		finally {
			this.busy = false;
			this.hide_progress();
		}
	}

	/**
	 * @param {string} label
	 * @param {number} percent optional, 0-100
	 * @param {number} total_bytes optional
	 */
	show_progress(label, percent, total_bytes) {
		var el = document.getElementById('ai_progress');
		if (!el) {
			el = document.createElement('div');
			el.id = 'ai_progress';
			el.className = 'ai_progress';
			el.setAttribute('role', 'status');
			el.innerHTML = '<span class="label"></span><progress max="100"></progress>';
			document.body.appendChild(el);
		}
		if (total_bytes) {
			label += ' (' + (total_bytes / 1048576).toFixed(1) + ' MB) ' + Math.round(percent) + '%';
		}
		el.querySelector('.label').textContent = label;
		var bar = el.querySelector('progress');
		if (percent == undefined) {
			bar.removeAttribute('value');
		}
		else {
			bar.value = percent;
		}
		el.hidden = false;
	}

	hide_progress() {
		var el = document.getElementById('ai_progress');
		if (el) {
			el.hidden = true;
		}
	}

	/**
	 * lets the browser paint (progress bar) before a long blocking step.
	 */
	next_frame() {
		return new Promise((resolve) => setTimeout(resolve, 30));
	}

}

export default AI_runtime_class;
