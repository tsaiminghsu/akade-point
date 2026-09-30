import { test, expect, type Page } from '@playwright/test';
import { GFX_KEY, GFX_VERSION, presetSettings } from '../components/city-game/graphicsSettings';

// Real-browser smoke tests for /games/city-game — the WebGL canvas mount,
// the load sequence, and the keyboard-driven pause menu. These are the game
// flows the Vitest unit/dom suite (components/city-game/__tests__) can't
// reach: it tests the engine and pure logic in Node/jsdom, never a real
// canvas or a real pointer-lock/keydown cycle. See MEMORY.md /
// project-city-game-gta for the coverage split.

// The game only finishes loading once 60 real frames have rendered
// (FrameCounter in CityGame.tsx). Headless Chromium has no GPU, so it falls
// back to software WebGL — anything above the "low" preset (shadows, bloom,
// a full 160x160 chunk-streamed city) never keeps up inside any sane timeout.
// detectTier already maps SwiftShader to low, but pinning it here keeps the
// run independent of the GPU table and of auto-adjust.
async function forceLowGraphics(page: Page) {
  await page.addInitScript(
    ([key, payload]) => window.localStorage.setItem(key, JSON.stringify(payload)),
    [GFX_KEY, { v: GFX_VERSION, ...presetSettings('low') }] as const,
  );
}

test.describe('city-game load', () => {
  test('mounts the canvas and reaches the HUD', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await forceLowGraphics(page);

    await page.goto('/games/city-game');

    // Loading screen appears first...
    await expect(page.getByText('AKADE CITY')).toBeVisible();

    // ...then the world finishes streaming in and the HUD takes over. (The
    // page has two canvases — the main r3f scene and the minimap — so scope
    // to the WebGL one specifically.)
    await expect(page.getByTestId('hud')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('canvas[data-engine^="three.js"]')).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe('city-game pause menu', () => {
  test.beforeEach(async ({ page }) => {
    await forceLowGraphics(page);
    await page.goto('/games/city-game');
    await expect(page.getByTestId('hud')).toBeVisible({ timeout: 120_000 });
  });

  test('Escape opens and closes the pause menu', async ({ page }) => {
    await expect(page.getByTestId('pause-menu')).not.toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).not.toBeVisible();
  });

  test('switching settings tabs does not throw', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.keyboard.press('Escape');
    const menu = page.getByTestId('pause-menu');
    await expect(menu).toBeVisible();

    await menu.getByText('音效', { exact: true }).click();
    await menu.getByText('控制', { exact: true }).click();
    await menu.getByText('顯示', { exact: true }).click();

    expect(errors).toEqual([]);
  });
});
