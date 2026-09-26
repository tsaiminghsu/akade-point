import { test, expect, type Page } from '@playwright/test';

// Browser coverage for the claw machine's DOM wiring: lobby link, coin →
// round start, and the service-mode menu driven by the keyboard like the
// board's joystick. Claw physics and payout logic are covered headless in
// components/claw-machine/__tests__/clawSim.test.ts.

const STORAGE = ['claw-machine-fleet-v1', 'claw-machine-fleet-saved-at', 'claw-machine-settings-v1', 'claw-machine-rig-v1'];
const FLEET_API = '/api/claw-machine/fleet';

/**
 * Stand in for the machines' store (SQLite) with one kept in memory for the
 * test, so tests start from nothing and never write to the real database.
 * Tests tagged @db talk to the real store instead.
 */
async function fakeFleetStore(page: Page) {
  let stored: { fleet: unknown; savedAt: number } | null = null;
  await page.route(`**${FLEET_API}**`, async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: stored ?? { fleet: null, savedAt: null } });
    if (req.method() === 'PUT') {
      const body = req.postDataJSON() as { fleet: unknown; savedAt: number };
      stored = { fleet: body.fleet, savedAt: body.savedAt };
      return route.fulfill({ json: { ok: true, savedAt: body.savedAt } });
    }
    stored = null;
    return route.fulfill({ json: { ok: true } });
  });
}

test.beforeEach(async ({ page }, info) => {
  if (!info.tags.includes('@db')) await fakeFleetStore(page);
});
/** A 大怒神 tower as it comes from the factory: a 單格 with three dice, all red to win. */
const factoryCell = { dice: 3, rule: 'red', sum: 14 };
const factoryTower = { double: false, cells: [factoryCell, factoryCell] };

/** Open the page with nothing saved: a single factory-default 1號機. */
async function freshStart(page: Page) {
  await page.goto('/games/claw-machine');
  await page.evaluate((keys) => { for (const k of keys) window.localStorage.removeItem(k); }, STORAGE);
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });
}

/** The active machine as saved in localStorage. */
async function savedMachine(page: Page) {
  return page.evaluate(() => {
    const fleet = JSON.parse(window.localStorage.getItem('claw-machine-fleet-v1') ?? '{}');
    return fleet.machines?.find((m: { id: string }) => m.id === fleet.activeId) ?? null;
  });
}

test('lobby links to the claw machine', async ({ page }) => {
  await page.goto('/games');
  await page.getByRole('link', { name: /二代選物販賣機/ }).click();
  await expect(page).toHaveURL(/\/games\/claw-machine$/);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });
});

test('a coin starts a round with the configured play time', async ({ page }) => {
  await page.goto('/games/claw-machine');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('INSERT COIN')).toBeVisible();
  await page.getByRole('button', { name: '投幣' }).click();
  // The sim consumes the credit on its next frame and starts the timer.
  await expect(page.getByText('移動天車').last()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('INSERT COIN')).toHaveCount(0);
});

test('multi-view layouts show every helper camera, and an inset click moves the main view', async ({ page }) => {
  await page.goto('/games/claw-machine');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });

  // Default is picture-in-picture: side, top-down and claw insets are labelled.
  for (const label of ['側面（看前後）', '俯視（看位置）', '爪子視角']) {
    await expect(page.getByText(label)).toBeVisible();
  }
  await page.getByRole('button', { name: '四分割' }).click();
  await expect(page.getByText('自由視角')).toBeVisible();
  await page.getByRole('button', { name: '單畫面' }).click();
  await expect(page.getByText('爪子視角')).toHaveCount(0);

  await page.getByRole('button', { name: '子母畫面' }).click();
  await page.getByRole('button', { name: '主畫面切到俯視（看位置）' }).click();
  await expect(page.getByRole('button', { name: '俯視', exact: true })).toHaveClass(/bg-white\/20/);
});

test('the operator can swap the claw and restock with different items, and it is remembered', async ({ page }) => {
  await freshStart(page);

  await page.keyboard.press('KeyP');
  await page.getByRole('tab', { name: '更換爪子' }).click();
  await page.getByRole('radio', { name: /二爪/ }).click();
  await expect(page.getByRole('radio', { name: /二爪/ })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('tab', { name: '擺場商品' }).click();
  await page.getByRole('button', { name: '公仔盒台', exact: true }).click();
  await page.getByRole('button', { name: '清空並重新擺場' }).click();
  await page.getByRole('button', { name: '儲存離開' }).click();
  await expect(page.getByText('二爪（夾盒爪）')).toBeVisible(); // shown in the monitor

  await page.reload();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });
  const rig = (await savedMachine(page)).rig;
  expect(rig).toEqual({
    claw: 'two',
    fit: { size: '4', bend: 'curved', openPct: 100 },
    stock: { categories: ['figure'], count: 60, random: false, countMin: 40 },
    chute: { width: 0.23, depth: 0.22, wallH: 0.15 },
    field: 'flat',
    bedLift: 0.08,
    tower: { count: 1, towers: [factoryTower, factoryTower, factoryTower], spring: 5 },
    shaker: { dice: 5, rule: 'reds', reds: 3, sum: 20, tension: 5 },
    antiSwing: { gap: 0.01, tilt: 0 },
    gantry: { minX: -0.39, maxX: 0.39, minZ: -0.26, maxZ: 0.26, home: null },
  });
});

test('the operator sizes the claw (號數, 直/彎, 爪位) and can test-open it', async ({ page }) => {
  await freshStart(page);

  await page.keyboard.press('KeyP');
  await page.getByRole('tab', { name: '更換爪子' }).click();
  await page.getByRole('radio', { name: /6號 巨無霸/ }).click();
  await page.getByRole('radio', { name: /直爪/ }).click();
  await expect(page.getByText('張開 30 cm')).toBeVisible();
  await page.getByRole('slider', { name: '爪位（開爪幅度）' }).fill('50');
  await expect(page.getByText(/^50% · \d+ cm$/)).toBeVisible();
  // Every size comes in both bends; 1號 is only listed straight, so its curved span is an estimate (約).
  await page.getByRole('radio', { name: /^1號/ }).click();
  await page.getByRole('radio', { name: /彎爪/ }).click();
  await expect(page.getByRole('radio', { name: /彎爪 約10cm/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /^4號半/ }).click();
  await page.getByRole('radio', { name: /直爪/ }).click();
  await expect(page.getByRole('radio', { name: /直爪 約24cm/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /^1號/ }).click();

  // 待機爪子 開爪 is saved: it's still open after leaving service mode and after a reload.
  await page.getByRole('radio', { name: '開爪', exact: true }).click();
  await expect(page.getByRole('radio', { name: '開爪', exact: true })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: '儲存離開' }).click();
  await expect(page.getByText('標準三爪 1號直爪')).toBeVisible(); // shown in the monitor
  await expect.poll(async () => (await savedMachine(page)).rig.fit).toEqual({ size: '1', bend: 'straight', openPct: 50 });
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('KeyP');
  await page.getByRole('tab', { name: '更換爪子' }).click();
  await expect(page.getByRole('radio', { name: '開爪', exact: true })).toHaveAttribute('aria-checked', 'true');
  expect((await savedMachine(page)).settings.idleOpen).toBe(1);
});

test('the operator adjusts the prize chute: 擋板 height and a smaller hole', async ({ page }) => {
  await freshStart(page);

  await page.keyboard.press('KeyP');
  await page.getByRole('tab', { name: '出貨口' }).click();
  await page.getByRole('slider', { name: '擋板高度' }).fill('25');
  await page.getByRole('slider', { name: '洞口寬度（左右）' }).fill('14');
  await page.getByRole('slider', { name: '洞口深度（前後）' }).fill('14');
  await expect(page.getByText('🧸 絨毛娃娃 會卡洞')).toBeVisible();
  await page.getByRole('button', { name: '儲存離開' }).click();
  await expect.poll(async () => (await savedMachine(page)).rig.chute).toEqual({ width: 0.14, depth: 0.14, wallH: 0.25 });

  await page.keyboard.press('KeyP');
  await page.getByRole('tab', { name: '出貨口' }).click();
  await page.getByRole('button', { name: '無擋板' }).click();
  await expect(page.getByText('無擋板', { exact: true }).last()).toBeVisible();
});

test('the operator picks a 檯面 and fits the magnet claw for a steel-ball machine', async ({ page }) => {
  await freshStart(page);
  await page.keyboard.press('KeyP');
  await page.getByRole('tab', { name: '出貨口' }).click();
  await page.getByRole('radio', { name: /老式階梯式/ }).click();
  await expect(page.getByRole('radio', { name: /老式階梯式/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('slider', { name: /三個角抬高/ })).toHaveCount(0); // only the bounce tables are 3D
  await page.getByRole('radio', { name: /^3D彈跳台/ }).click();
  await expect(page.getByRole('radio', { name: /^3D彈跳台/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('slider', { name: /三個角抬高/ }).fill('12');
  await page.getByRole('radio', { name: /火山口彈跳台/ }).click();
  await expect(page.getByRole('slider', { name: '火山口高度' })).toBeVisible();

  await page.getByRole('tab', { name: '擺場商品' }).click();
  await page.getByRole('button', { name: '鐵球台', exact: true }).click();
  await page.getByRole('tab', { name: '更換爪子' }).click();
  await expect(page.getByText('目前擺的是鐵球，建議換「磁吸爪」。')).toBeVisible();
  await page.getByRole('radio', { name: /磁吸爪/ }).click();
  await expect(page.getByText('磁吸爪不分號數，也不用調爪位。')).toBeVisible();
  await page.getByRole('button', { name: '儲存離開' }).click();
  await expect(page.getByText('磁吸爪（電磁鐵）')).toBeVisible(); // in the monitor

  await expect.poll(async () => (await savedMachine(page))?.rig.field).toBe('volcano');
  const rig = (await savedMachine(page)).rig;
  expect(rig.claw).toBe('magnet');
  expect(rig.stock.categories).toEqual(['steel']);
  expect(rig.bedLift).toBe(0.12);
});

test('the operator sets up the 大怒神: towers, 雙格, each cell’s dice and rule, and the magnet claw it needs', async ({ page }) => {
  await freshStart(page);
  await page.keyboard.press('KeyP');
  await page.getByRole('tab', { name: '出貨口' }).click();
  await page.getByRole('radio', { name: /^大怒神/ }).click();
  const setup = page.getByTestId('tower-setup');
  await expect(setup).toBeVisible();
  await expect(page.getByTestId('tower-chance')).toContainText('3.7%'); // 3 dice all red: 1/27
  await setup.getByRole('radiogroup', { name: '骰子顆數' }).getByRole('radio', { name: '2', exact: true }).click();
  await setup.getByRole('radio', { name: /總點數/ }).click();
  await page.getByRole('slider', { name: '總點數門檻' }).fill('11');
  await expect(page.getByTestId('tower-chance')).toContainText('8.3%'); // 5+6, 6+5, 6+6 of 36
  await page.getByRole('slider', { name: '彈簧彈性' }).fill('8');
  await expect(page.getByTestId('tower-spring')).toHaveText('8（彈很高）');

  // A second tower, made a 雙格: its right cell gets two dice under 豹子.
  await setup.getByRole('radio', { name: '2 座' }).click();
  await setup.getByRole('radio', { name: '第 2 座' }).click();
  await setup.getByRole('radio', { name: '雙格（加大）' }).click();
  await expect(setup.getByTestId('cell-左格')).toBeVisible();
  await setup.getByRole('radiogroup', { name: '右格骰子顆數' }).getByRole('radio', { name: '2', exact: true }).click();
  await setup.getByRole('radiogroup', { name: '右格中獎條件' }).getByRole('radio', { name: /豹子/ }).click();
  // Either cell: 1 − (26/27)(5/6) ≈ 20%.
  await expect(page.getByTestId('tower-chance')).toContainText('20%');
  await expect(page.getByTestId('tower-chance')).toContainText('第 2 座');

  await page.getByRole('tab', { name: '更換爪子' }).click();
  await expect(page.getByText(/大怒神要用「磁吸爪」/)).toBeVisible();
  await page.getByRole('radio', { name: /磁吸爪/ }).click();
  await page.getByRole('tab', { name: '擺場商品' }).click();
  await expect(page.getByText(/大怒神台裡只放骰子/)).toBeVisible();
  await page.getByRole('button', { name: '儲存離開' }).click();

  await expect(page.getByTestId('dice-result')).toContainText('還沒落下');
  await expect(page.getByText('娃娃都被夾完了！')).toHaveCount(0); // it holds no prizes on purpose
  await expect.poll(async () => (await savedMachine(page))?.rig.field).toBe('tower');
  const rig = (await savedMachine(page)).rig;
  expect(rig.tower).toEqual({
    count: 2,
    towers: [
      { double: false, cells: [{ dice: 2, rule: 'sum', sum: 11 }, factoryCell] },
      { double: true, cells: [factoryCell, { dice: 2, rule: 'same', sum: 12 }] },
      factoryTower,
    ],
    spring: 8,
  });
  expect(rig.claw).toBe('magnet');
});

test('the operator sets up the 搖骰子盒: dice, winning rule, cords, and the magnet claw it needs', async ({ page }) => {
  await freshStart(page);
  await page.keyboard.press('KeyP');
  await page.getByRole('tab', { name: '出貨口' }).click();
  await page.getByRole('radio', { name: /^搖骰子盒/ }).click();
  const setup = page.getByTestId('shaker-setup');
  await expect(setup).toBeVisible();
  await expect(page.getByTestId('shaker-chance')).toContainText('21%'); // 3 or more reds of 5: 51/243
  await setup.getByRole('radiogroup', { name: '骰子顆數' }).getByRole('radio', { name: '3', exact: true }).click();
  await expect(page.getByTestId('shaker-chance')).toContainText('3.7%'); // all 3 red
  await setup.getByRole('radio', { name: /總點數/ }).click();
  await page.getByRole('slider', { name: '總點數門檻' }).fill('14');
  await expect(page.getByTestId('shaker-chance')).toContainText('16%'); // 14 or more on 3 dice: 35/216
  await page.getByRole('slider', { name: '橡皮繩鬆緊' }).fill('8');
  await expect(page.getByTestId('shaker-tension')).toHaveText('8（緊）');

  await page.getByRole('tab', { name: '更換爪子' }).click();
  await expect(page.getByText(/搖骰子盒要用「磁吸爪」/)).toBeVisible();
  await page.getByRole('radio', { name: /磁吸爪/ }).click();
  await page.getByRole('tab', { name: '擺場商品' }).click();
  await expect(page.getByText(/搖骰子盒台裡只放骰子/)).toBeVisible();
  await page.getByRole('tab', { name: '天車限位' }).click();
  await page.getByRole('button', { name: '固定在搖骰子盒' }).click();
  await expect(page.getByTestId('gantry-status')).toContainText('天車固定不動');
  await page.getByRole('button', { name: '儲存離開' }).click();

  await expect(page.getByTestId('shake-result')).toContainText('還沒搖');
  await expect(page.getByText('娃娃都被夾完了！')).toHaveCount(0);
  await expect.poll(async () => (await savedMachine(page))?.rig.field).toBe('shaker');
  const rig = (await savedMachine(page)).rig;
  expect(rig.shaker).toEqual({ dice: 3, rule: 'sum', reds: 3, sum: 14, tension: 8 });
  expect(rig.gantry).toEqual({ minX: 0.1, maxX: 0.1, minZ: -0.06, maxZ: -0.06, home: { x: 0.1, z: -0.06 } });
  expect(rig.claw).toBe('magnet');
});

test('the operator moves the limit switches and pins the gantry over the 大怒神', async ({ page }) => {
  await freshStart(page);
  await page.keyboard.press('KeyP');
  await page.getByRole('tab', { name: '天車限位' }).click();
  await expect(page.getByTestId('gantry-status')).toContainText('左右 78 cm、前後 52 cm');
  await expect(page.getByRole('button', { name: '固定在大怒神' })).toHaveCount(0); // no tower fitted yet

  // Fence the claw in from the right, and start it away from the chute.
  await page.getByRole('slider', { name: '右限位（距右邊玻璃）' }).fill('40');
  await expect(page.getByTestId('gantry-status')).toContainText('左右 44 cm');
  await page.getByRole('radio', { name: '自訂位置' }).click();
  await page.getByRole('slider', { name: '起始點左右（距左邊玻璃）' }).fill('30');
  await expect(page.getByText('起始點不在出貨口上方')).toBeVisible();

  await page.getByRole('tab', { name: '出貨口' }).click();
  await page.getByRole('radio', { name: /^大怒神/ }).click();
  await page.getByRole('tab', { name: '天車限位' }).click();
  await page.getByRole('button', { name: '固定在大怒神' }).click();
  await expect(page.getByTestId('gantry-status')).toContainText('天車固定不動');
  await page.getByRole('button', { name: '儲存離開' }).click();

  await expect.poll(async () => (await savedMachine(page))?.rig.gantry)
    .toEqual({ minX: 0, maxX: 0, minZ: -0.06, maxZ: -0.06, home: { x: 0, z: -0.06 } });
});

test('the operator can load a fuller cabinet, pick a random amount, and top it up', async ({ page }) => {
  await freshStart(page);

  await page.keyboard.press('KeyP');
  await page.getByRole('tab', { name: '擺場商品' }).click();
  await expect(page.getByText(/機台內目前\s*60\s*個/)).toBeVisible();
  // Moving the slider alone changes what's in the cabinet, both ways.
  await page.getByRole('slider', { name: '數量' }).fill('50');
  await expect(page.getByText(/機台內目前\s*50\s*個/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('slider', { name: '數量' }).fill('20');
  await expect(page.getByText(/機台內目前\s*20\s*個/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '儲存離開' }).click();
  await expect(page.getByText('INSERT COIN')).toBeVisible();
  await page.keyboard.press('KeyP');
  await page.getByRole('tab', { name: '擺場商品' }).click();
  await expect(page.getByText(/機台內目前\s*20\s*個/)).toBeVisible();

  await page.getByRole('radio', { name: '隨機數量' }).click();
  await page.getByRole('slider', { name: '最少' }).fill('20');
  await page.getByRole('slider', { name: '最多' }).fill('30');
  await expect(page.getByText('每次擺場或補貨，都在 20–30 個之間隨機。')).toBeVisible();
  await page.getByRole('button', { name: '清空並重新擺場' }).click();
  const left = () => page.getByText(/機台內目前/).locator('span').textContent().then(Number);
  await expect.poll(left).toBeLessThanOrEqual(30);
  expect(await left()).toBeGreaterThanOrEqual(20);
});

test('service mode edits a setting with the stick keys and persists it', async ({ page }) => {
  await freshStart(page);

  await page.keyboard.press('KeyP');
  await expect(page.getByText('台主設定')).toBeVisible();
  // ▼ nine times → past the 基本設定 group to V1 強電壓 (default 40 V), ◀ twice → 39 V.
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowDown');
  await expect(page.getByText('SET-V1')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: /V1強電壓\s*39\.0 V/ })).toBeVisible();

  // Down to A2 下線長度: the LCD shows how much cable that is.
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  await expect(page.getByText('SET-A2')).toBeVisible();
  await expect(page.getByText(/下線長度 ≈ \d+ cm/)).toBeVisible();
  await expect(page.getByText(/紅色平面/)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByText('台主設定')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });
  expect((await savedMachine(page)).settings.strongPower).toBe(39);
});

test('several machines each keep their own settings, rig and name', async ({ page }) => {
  await freshStart(page);
  await expect(page.getByRole('button', { name: '機台：1號機' })).toBeVisible();

  // 1號機: a 二爪 box machine with a weak 強電壓.
  await page.keyboard.press('KeyP');
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: /V1強電壓\s*35\.0 V/ })).toBeVisible();
  await page.getByRole('tab', { name: '更換爪子' }).click();
  await page.getByRole('radio', { name: /二爪/ }).click();
  await page.getByRole('button', { name: '儲存離開' }).click();

  // Add 2號機 with factory settings, rename it, and set it up differently.
  await page.getByRole('button', { name: '機台：1號機' }).click();
  await page.getByRole('button', { name: '＋ 新增機台' }).click();
  await expect(page.getByRole('button', { name: '機台：2號機' })).toBeVisible();
  await expect(page.getByText('標準三爪 4號彎爪')).toBeVisible(); // fresh claw, not 1號機's
  await page.getByRole('button', { name: '機台：2號機' }).click();
  await page.getByRole('button', { name: '重新命名 2號機' }).click();
  await page.getByRole('textbox', { name: '機台名稱' }).fill('入口巨無霸台');
  await page.getByRole('button', { name: '確定', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '機台：入口巨無霸台' })).toBeVisible();
  await page.keyboard.press('KeyP');
  await page.getByRole('tab', { name: '更換爪子' }).click();
  await page.getByRole('radio', { name: /6號 巨無霸/ }).click();
  await page.getByRole('button', { name: '儲存離開' }).click();

  // Back to 1號機: its own claw and 強電壓 come back; then both survive a reload.
  await page.getByRole('button', { name: '機台：入口巨無霸台' }).click();
  await page.getByRole('radio', { name: /1號機/ }).click();
  await expect(page.getByText('二爪（夾盒爪） 4號彎爪')).toBeVisible();
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: '機台：1號機' })).toBeVisible();
  const fleet = await page.evaluate(() => JSON.parse(window.localStorage.getItem('claw-machine-fleet-v1') ?? '{}'));
  expect(fleet.machines.map((m: { name: string }) => m.name)).toEqual(['1號機', '入口巨無霸台']);
  expect(fleet.machines[0].settings.strongPower).toBe(35);
  expect(fleet.machines[0].rig.claw).toBe('two');
  expect(fleet.machines[1].settings.strongPower).toBe(40);
  expect(fleet.machines[1].rig.fit.size).toBe('6');

  // Deleting asks first, and the last machine can't be deleted.
  await page.getByRole('button', { name: '機台：1號機' }).click();
  await page.getByRole('button', { name: '刪除 入口巨無霸台' }).click();
  await page.getByRole('button', { name: '確定刪除' }).click();
  await expect(page.getByRole('button', { name: '刪除 1號機' })).toBeDisabled();
});

test('the machines are kept in the SQLite store: a browser with nothing saved gets them back', { tag: '@db' }, async ({ page, request }) => {
  const shop = `e2e-${Date.now()}`;
  try {
    await page.goto(`/games/claw-machine?shop=${shop}`);
    await page.evaluate((keys) => { for (const k of keys) window.localStorage.removeItem(k); }, STORAGE);
    await page.reload();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });
    // A shop with nothing stored gets this browser's (factory) machines.
    await expect(page.getByTestId('fleet-sync')).toHaveText('已存到資料庫', { timeout: 15_000 });

    await page.keyboard.press('KeyP');
    await page.getByRole('tab', { name: '出貨口' }).click();
    await page.getByRole('radio', { name: /^搖骰子盒/ }).click();
    await page.getByRole('slider', { name: '橡皮繩鬆緊' }).fill('3');
    await page.getByRole('button', { name: '儲存離開' }).click();
    await expect(page.getByTestId('fleet-sync')).toHaveText('已存到資料庫', { timeout: 15_000 });
    await expect.poll(async () => {
      const body = await (await request.get(`${FLEET_API}?shop=${shop}`)).json();
      return body.fleet?.machines?.[0]?.rig?.shaker?.tension;
    }).toBe(3);

    // Another browser, or this one wiped: the store has the machine as it was left.
    await page.evaluate((keys) => { for (const k of keys) window.localStorage.removeItem(k); }, STORAGE);
    await page.reload();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('shake-result')).toBeVisible();
    const rig = (await savedMachine(page)).rig;
    expect(rig.field).toBe('shaker');
    expect(rig.shaker.tension).toBe(3);
  } finally {
    await request.delete(`${FLEET_API}?shop=${shop}`);
  }
  expect((await (await request.get(`${FLEET_API}?shop=${shop}`)).json()).fleet).toBeNull();
});

test('the machine saved before there were several becomes 1號機', async ({ page }) => {
  await page.goto('/games/claw-machine');
  await page.evaluate(() => {
    window.localStorage.removeItem('claw-machine-fleet-v1');
    window.localStorage.setItem('claw-machine-settings-v1', JSON.stringify({ strongPower: 22 }));
    window.localStorage.setItem('claw-machine-rig-v1', JSON.stringify({ claw: 'kingkong' }));
  });
  await page.reload();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: '機台：1號機' })).toBeVisible();
  await expect(page.getByText('金剛K爪 4號彎爪')).toBeVisible();
  await expect.poll(async () => (await savedMachine(page))?.settings.strongPower).toBe(22);
});
