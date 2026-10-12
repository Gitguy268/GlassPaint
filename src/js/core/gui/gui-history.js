import app from './../../app.js';

/**
 * GUI class responsible for rendering undo history block on right sidebar.
 * Shows every step that can be undone or redone, click a step to go back or forward to it.
 */
class GUI_history_class {

	render_main_history() {
		document.getElementById('toggle_history').addEventListener('click', (event) => {
			var item = event.target.closest('[data-index]');
			if (item) {
				this.go_to(parseInt(item.dataset.index));
			}
		});
		this.render_history();
	}

	/**
	 * called by Base_state after every change in history.
	 */
	render_history() {
		var target = document.getElementById('toggle_history');
		if (!target || !app.State) {
			return;
		}
		var list = document.createElement('div');
		list.className = 'history_list';

		//step 0 is the state before the first action
		var names = ['Start'];
		for (var action of app.State.action_history) {
			names.push(action.action_description);
		}
		var active = null;
		for (var i = 0; i < names.length; i++) {
			var item = document.createElement('button');
			item.type = 'button';
			item.className = 'item trn';
			item.dataset.index = i;
			item.textContent = names[i];
			if (i == app.State.action_history_index) {
				item.classList.add('active');
				active = item;
			}
			if (i > app.State.action_history_index) {
				item.classList.add('undone');
			}
			list.appendChild(item);
		}

		target.replaceChildren(list);
		list.scrollTop = active.offsetTop - list.clientHeight / 2;
	}

	/**
	 * undo or redo until history is at requested step.
	 *
	 * @param {int} index 0 = before the first action
	 */
	async go_to(index) {
		while (app.State.action_history_index > index && app.State.can_undo()) {
			await app.State.undo_action();
		}
		while (app.State.action_history_index < index && app.State.can_redo()) {
			await app.State.redo_action();
		}
	}

}

export default GUI_history_class;
