/**
 * Liquid Glass refraction. Bends the backdrop along the rim of the toolbar and dialogs, like a thick piece
 * of glass would, using an SVG feDisplacementMap filter referenced from backdrop-filter.
 *
 * Only Chromium renders SVG filters in backdrop-filter. Everywhere else nothing is done here and the plain
 * blur from glass.css stays. Strength and rim width come from --glass-refraction and --glass-bezel.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

class Glass_class {

	constructor() {
		this.defs = null;
		this.count = 0;
		this.attached = new Map();
	}

	is_supported() {
		//Firefox and Safari accept url() in backdrop-filter but do not draw it, so the engine has to be asked
		return !!navigator.userAgentData
			&& navigator.userAgentData.brands.some((item) => item.brand == 'Chromium')
			&& CSS.supports('backdrop-filter', 'url(#a)');
	}

	init() {
		if (!this.is_supported()) {
			return;
		}

		var svg = document.createElementNS(SVG_NS, 'svg');
		svg.setAttribute('width', 0);
		svg.setAttribute('height', 0);
		svg.setAttribute('aria-hidden', 'true');
		svg.style.position = 'absolute';
		this.defs = svg.appendChild(document.createElementNS(SVG_NS, 'defs'));
		document.body.appendChild(svg);

		this.attach(document.querySelector('.sidebar_left'));

		//dialogs come and go
		new MutationObserver((records) => {
			for (var record of records) {
				record.addedNodes.forEach((node) => this.attach(node));
				record.removedNodes.forEach((node) => this.detach(node));
			}
		}).observe(document.getElementById('popups'), {childList: true});
	}

	attach(el) {
		var id = 'glass_refract_' + (++this.count);
		var filter = document.createElementNS(SVG_NS, 'filter');
		filter.setAttribute('id', id);
		filter.setAttribute('filterUnits', 'userSpaceOnUse');
		filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
		filter.setAttribute('color-interpolation-filters', 'sRGB');
		filter.innerHTML = '<feImage result="map" preserveAspectRatio="none" />'
			+ '<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" />';
		this.defs.appendChild(filter);

		var observer = new ResizeObserver(() => this.render(el, filter));
		observer.observe(el);
		this.attached.set(el, {filter: filter, observer: observer});

		el.style.setProperty('--glass-refract', 'url(#' + id + ')');
		el.classList.add('glass-refract');
	}

	detach(el) {
		var data = this.attached.get(el);
		if (data) {
			data.observer.disconnect();
			data.filter.remove();
			this.attached.delete(el);
		}
	}

	/**
	 * draws displacement map for element size: red = horizontal shift, green = vertical shift, 128 = none.
	 * Pixels within the rim are shifted towards the middle of the element, stronger at the very edge.
	 */
	render(el, filter) {
		var w = el.offsetWidth;
		var h = el.offsetHeight;
		if (!w || !h) {
			return;
		}
		var style = getComputedStyle(el);
		var radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, w / 2, h / 2);
		var bezel = parseFloat(style.getPropertyValue('--glass-bezel')) || 1;
		var strength = parseFloat(style.getPropertyValue('--glass-refraction')) || 0;

		var canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		var ctx = canvas.getContext('2d');
		var img = ctx.createImageData(w, h);
		var data = img.data;
		var half_w = w / 2;
		var half_h = h / 2;

		for (var y = 0; y < h; y++) {
			for (var x = 0; x < w; x++) {
				//distance to the rounded edge and direction to it
				var px = x + 0.5 - half_w;
				var py = y + 0.5 - half_h;
				var qx = Math.abs(px) - (half_w - radius);
				var qy = Math.abs(py) - (half_h - radius);
				var nx = 0;
				var ny = 0;
				var distance;
				if (qx > 0 && qy > 0) {
					var length = Math.hypot(qx, qy);
					distance = radius - length;
					nx = qx / length;
					ny = qy / length;
				}
				else if (qx > qy) {
					distance = radius - qx;
					nx = 1;
				}
				else {
					distance = radius - qy;
					ny = 1;
				}
				var amount = Math.min(1, Math.max(0, 1 - distance / bezel));
				amount = amount * amount;

				var i = (y * w + x) * 4;
				data[i] = 128 - Math.sign(px) * nx * amount * 127;
				data[i + 1] = 128 - Math.sign(py) * ny * amount * 127;
				data[i + 2] = 128;
				data[i + 3] = 255;
			}
		}
		ctx.putImageData(img, 0, 0);

		filter.setAttribute('x', 0);
		filter.setAttribute('y', 0);
		filter.setAttribute('width', w);
		filter.setAttribute('height', h);
		var image = filter.querySelector('feImage');
		image.setAttribute('width', w);
		image.setAttribute('height', h);
		image.setAttribute('href', canvas.toDataURL());
		filter.querySelector('feDisplacementMap').setAttribute('scale', strength);
	}

}

export default Glass_class;
