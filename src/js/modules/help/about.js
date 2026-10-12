import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';

class Help_about_class {

	constructor() {
		this.POP = new Dialog_class();
	}

	//about
	about() {
		var settings = {
			title: 'About',
			params: [
				{title: "", html: '<img style="width:64px;" class="about-logo" alt="" src="images/glasspaint.svg" />'},
				{title: "Name:", html: '<span class="about-name">GlassPaint</span>'},
				{title: "Version:", value: VERSION},
				{title: "Description:", value: "Online image editor with a Liquid Glass interface and AI tools that run in the browser."},
				{title: "Based on:", html: 'Based on <a href="https://github.com/viliusle/miniPaint">miniPaint</a> by ViliusL (MIT License)'},
				{title: "AI models:", html: 'U-2-Net, IS-Net, SlimSAM, Swin2SR via Transformers.js. See MODELS.md'},
			],
		};
		this.POP.show(settings);
	}

}

export default Help_about_class;
