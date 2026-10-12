import app from './../../app.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

/**
 * AI > Select Object. The work is done by the tool in src/js/tools/ai_select.js, this only switches to it.
 */
class AI_select_object_class {

	select_object() {
		app.GUI.GUI_tools.activate_tool('ai_select');
		alertify.success('Click an object. Shift+click adds to it, Alt+click removes from it.');
	}

}

export default AI_select_object_class;
