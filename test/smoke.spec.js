const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SUBJECT = path.join(__dirname, 'fixtures', 'subject.png');
const PSD = path.join(__dirname, 'fixtures', 'layers.psd');

let errors;

test.beforeEach(async ({ page }) => {
	errors = [];
	page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
	page.on('console', (message) => {
		if (message.type() == 'error') {
			errors.push(message.text());
		}
	});
	page.on('requestfailed', (request) => errors.push('request failed: ' + request.url()));
	await page.goto('./');
	await page.waitForSelector('#main_menu a');
});

test.afterEach(() => {
	expect(errors).toEqual([]);
});

async function open_file(page, file) {
	await page.evaluate(() => window.FileOpen.open_file());
	await page.setInputFiles('#file_open', file);
	await expect.poll(() => page.evaluate(() => window.AppConfig.layer.type == 'image' && window.AppConfig.layer.link.complete)).toBe(true);
	//app saves the previous state before it accepts the next action
	await page.waitForTimeout(500);
}

async function menu(page, ...names) {
	for (const name of names) {
		await page.locator('#main_menu a', { hasText: new RegExp('^\\s*' + name) }).first().click();
	}
}

// RGBA of one pixel of the active layer, x and y as 0-1
function pixel(page, x, y) {
	return page.evaluate(async ([x, y]) => {
		const layer = window.AppConfig.layer;
		await layer.link.decode();
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const ctx = canvas.getContext('2d');
		ctx.drawImage(layer.link, -Math.floor(x * layer.width_original), -Math.floor(y * layer.height_original));
		return Array.from(ctx.getImageData(0, 0, 1, 1).data);
	}, [x, y]);
}

async function ai_finished(page) {
	await expect(page.locator('#ai_progress')).toBeHidden({ timeout: 150000 });
}

test('loads from a sub-path with the glass UI', async ({ page, browserName }) => {
	await expect(page).toHaveTitle(/GlassPaint/);
	await expect(page.locator('#main_menu')).toContainText('AI');
	const filter = await page.evaluate(() => getComputedStyle(document.querySelector('.sidebar_left')).backdropFilter);
	expect(filter).toContain('blur');
	//refraction is a Chromium feature, everything else must fall back to plain blur
	expect(filter.includes('url(')).toBe(browserName == 'chromium');

	await menu(page, 'Help', 'About');
	await expect(page.locator('#popups .popup')).toContainText('Based on miniPaint');
});

test('open image, apply a filter, undo, redo, export PNG', async ({ page }) => {
	await open_file(page, SUBJECT);
	const original = await pixel(page, 0.5, 0.5);

	await menu(page, 'Image', 'White Balance');
	await page.locator('#pop_data_temperature').evaluate((input) => {
		input.value = -80;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	});
	await page.locator('#popups [data-id="popup_ok"]').click();
	await expect.poll(() => pixel(page, 0.5, 0.5)).not.toEqual(original);
	const filtered = await pixel(page, 0.5, 0.5);
	expect(filtered[2]).toBeGreaterThan(original[2]);	//cooler = more blue

	await page.keyboard.press('Control+z');
	await expect.poll(() => pixel(page, 0.5, 0.5)).toEqual(original);
	await page.keyboard.press('Control+y');
	await expect.poll(() => pixel(page, 0.5, 0.5)).toEqual(filtered);

	await menu(page, 'File', 'Export');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.locator('#popups [data-id="popup_ok"]').click(),
	]);
	expect(download.suggestedFilename()).toMatch(/\.png$/);
	const file = fs.readFileSync(await download.path());
	expect(file.subarray(1, 4).toString()).toBe('PNG');
	expect(file.length).toBeGreaterThan(1000);
});

test('AI background remover: cut-out, mask layer, undo, and again without network', async ({ page, context }) => {
	await open_file(page, SUBJECT);

	const remove_background = async () => {
		await menu(page, 'AI', 'Remove Background');
		await page.waitForTimeout(700);
		await ai_finished(page);
		await page.locator('#popups [data-id="popup_ok"]').click();
		await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(2);
	};

	await remove_background();
	expect((await pixel(page, 0.5, 0.5))[3]).toBeGreaterThan(200);	//the ball stays
	expect((await pixel(page, 0.03, 0.05))[3]).toBeLessThan(40);	//the backdrop is gone
	const layers = await page.evaluate(() => window.AppConfig.layers.map((layer) => [layer.name, layer.visible]));
	expect(layers).toEqual([['subject.png', true], ['subject.png mask', false]]);

	//one undo step brings back the photo and removes the mask layer
	await page.keyboard.press('Control+z');
	await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(1);
	await expect.poll(async () => (await pixel(page, 0.03, 0.05))[3]).toBe(255);
	await page.waitForTimeout(300);

	//model is cached now, the second run must not need the network
	await context.setOffline(true);
	await remove_background();
	expect((await pixel(page, 0.03, 0.05))[3]).toBeLessThan(40);
	await context.setOffline(false);
});

test('AI select object: click, then cut out to a new layer', async ({ page }) => {
	await open_file(page, SUBJECT);
	await menu(page, 'AI', 'Select Object');
	const box = await page.locator('#canvas_minipaint').boundingBox();
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await page.waitForTimeout(700);
	await ai_finished(page);

	await page.locator('#cut_out').click();
	await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(2);
	const object = await page.evaluate(() => {
		const layer = window.AppConfig.layers[1];
		return [layer.name, layer.width, layer.height];
	});
	expect(object[0]).toBe('subject.png object');
	//the ball is 280 px wide in a 640 px photo
	expect(object[1]).toBeGreaterThan(200);
	expect(object[1]).toBeLessThan(420);
});

test('PSD import keeps layers, opacity and visibility', async ({ page }) => {
	await page.evaluate(() => window.FileOpen.open_file());
	await page.setInputFiles('#file_open', PSD);
	await expect.poll(() => page.evaluate(() => window.AppConfig.layers.length)).toBe(3);
	const layers = await page.evaluate(() => window.AppConfig.layers.map((layer) => [layer.name, layer.x, layer.y, layer.visible, layer.opacity, layer.composition]));
	expect(layers).toEqual([
		['Background', 0, 0, true, 100, 'source-over'],
		['Red box', 20, 30, true, 50, 'source-over'],
		['Hidden blue', 150, 60, false, 100, 'multiply'],
	]);
	expect(await page.evaluate(() => [window.AppConfig.WIDTH, window.AppConfig.HEIGHT])).toEqual([300, 200]);
});

test('history panel jumps between steps, tool settings survive a reload', async ({ page }) => {
	const box = await page.locator('#canvas_minipaint').boundingBox();
	for (let i = 0; i < 2; i++) {
		await page.mouse.move(box.x + 100, box.y + 100 + i * 60);
		await page.mouse.down();
		await page.mouse.move(box.x + 400, box.y + 130 + i * 60, { steps: 6 });
		await page.mouse.up();
		await page.waitForTimeout(300);
	}
	await page.locator('h2[data-target="toggle_history"]').click();
	await expect(page.locator('.history_list .item')).toHaveCount(3);
	await page.locator('.history_list .item', { hasText: 'Start' }).click();
	await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(0);
	await page.locator('.history_list .item').last().click();
	await expect.poll(() => page.evaluate(() => window.State.action_history_index)).toBe(2);

	await page.fill('.attributes .size input', '37');
	await page.press('.attributes .size input', 'Tab');
	await page.reload();
	await page.waitForSelector('#main_menu a');
	await expect(page.locator('.attributes .size input')).toHaveValue('37');
});
