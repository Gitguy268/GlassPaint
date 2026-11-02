const { defineConfig, devices } = require('@playwright/test');

// Tests run against the production build in _site/GlassPaint/ ("npm run site"), served from a sub-path
// the way GitHub Pages serves it. Port 4321, not a default port another project may be using.
module.exports = defineConfig({
	testDir: './test',
	timeout: 180000,
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: 'http://127.0.0.1:4321/GlassPaint/',
		viewport: {width: 1440, height: 900},
	},
	webServer: {
		command: 'node test/serve.js',
		url: 'http://127.0.0.1:4321/GlassPaint/',
		reuseExistingServer: false,
	},
	projects: [
		{
			//AI runs on WebGPU here
			name: 'chromium',
			use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900},
				launchOptions: {args: process.platform == 'darwin' ? ['--enable-unsafe-webgpu', '--use-angle=metal'] : ['--enable-unsafe-webgpu']}},
		},
		{
			//no WebGPU in Playwright's Firefox, so AI runs on WebAssembly here
			name: 'firefox',
			use: {...devices['Desktop Firefox'], viewport: {width: 1440, height: 900}},
		},
	],
});
