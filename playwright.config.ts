import { defineConfig, devices } from '@playwright/test';

// End-to-end browser tests. Separate from the Vitest unit/dom/integration
// projects (vitest.config.mts) — these drive a real Chromium instance against
// a real Next.js dev server, for flows that unit tests can't reach (WebGL
// canvas mounting, pointer lock, keyboard-driven pause menu).
export default defineConfig({
  testDir: './e2e',
  // Each test does a full cold WebGL load of a chunk-streamed 160x160 city
  // under (slow, CPU-bound) software rendering — running several at once
  // starves them all of CPU and nothing finishes within any timeout.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  // Headless Chromium falls back to software WebGL rendering (~1fps for this
  // scene, measured), and the load sequence waits for 60 real rendered
  // frames — a cold load can genuinely take over a minute before any error
  // would be real.
  timeout: 150_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Headless Chromium has no real GPU; WebGL needs software rendering
        // explicitly re-enabled or the canvas context (and the whole
        // renderer process, under load) can die mid-scene-build.
        launchOptions: {
          args: [
            '--enable-unsafe-swiftshader',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            // Chromium throttles requestAnimationFrame on a "backgrounded"
            // page, which the game's load sequence depends on (it waits for
            // 60 real rendered frames) — without these it can stall forever.
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev:next',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
