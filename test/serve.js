/**
 * Static file server for the tests: serves _site/ on http://127.0.0.1:4321, so the app is at /GlassPaint/.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '_site');
const types = {
	'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
	'.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
	'.gif': 'image/gif', '.wasm': 'application/wasm',
};

http.createServer(function (request, response) {
	var file = path.join(root, decodeURIComponent(new URL(request.url, 'http://x').pathname));
	if (!file.startsWith(root)) {
		response.writeHead(403).end();
		return;
	}
	if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
		file = path.join(file, 'index.html');
	}
	fs.readFile(file, function (error, data) {
		if (error) {
			response.writeHead(404).end('Not found');
			return;
		}
		response.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
		response.end(data);
	});
}).listen(4321, '127.0.0.1');
