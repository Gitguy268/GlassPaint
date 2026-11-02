/**
 * Collects the files a static host needs into _site/GlassPaint/, the same sub-path layout GitHub Pages uses.
 * Run "npm run build" first (or use "npm run site", which does both).
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, '_site', 'GlassPaint');

fs.rmSync(path.join(root, '_site'), {recursive: true, force: true});
fs.mkdirSync(target, {recursive: true});
for (const item of ['index.html', 'dist', 'images']) {
	fs.cpSync(path.join(root, item), path.join(target, item), {recursive: true});
}
//GIF export loads its worker from this path
const worker = 'src/js/libs/gifjs/gif.worker.js';
fs.mkdirSync(path.dirname(path.join(target, worker)), {recursive: true});
fs.copyFileSync(path.join(root, worker), path.join(target, worker));

console.log('Static site written to ' + target);
