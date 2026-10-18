import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.ready);
  await page.evaluate(() => { window.mount(); window.mountEditor(); });
});

test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('loads before hass/config and uses matching card defaults', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const editor = document.createElement('weather-chart-card-editor');
    document.body.append(editor);
    await editor.updateComplete;
    editor.setConfig({ entity: 'weather.home' });
    await editor.updateComplete;
    const value = editor.shadowRoot.querySelector('[name="entity"]').value;
    editor.remove();
    return value;
  })).toBe('weather.home');
  await expect(page.getByLabel('Show current time', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Show main section')).toBeChecked();
  await expect(page.getByLabel('Show feels like temperature')).not.toBeChecked();
  await page.getByRole('button', { name: 'Forecast', exact: true }).click();
  await expect(page.getByLabel('Round temperatures')).not.toBeChecked();
  await expect(page.getByLabel('Show condition icons')).toBeChecked();
});

test('preserves unknown keys, nested options and immutable input configuration', async ({ page }) => {
  await page.evaluate(() => {
    window.original = { entity: 'weather.home', custom_key: 42,
      forecast: { type: 'daily', temperature1_color: 'red' }, units: { visibility: 'km' } };
    Object.freeze(original.forecast); Object.freeze(original.units); Object.freeze(original);
    editor.setConfig(original);
  });
  await page.getByLabel('Forecast type', { exact: true }).selectOption('hourly');
  await page.getByRole('button', { name: 'Forecast', exact: true }).click();
  await page.getByLabel('Chart height').fill('240');
  await page.getByLabel('Chart height').press('Tab');
  await page.getByLabel('Round temperatures').check();
  expect(await page.evaluate(() => edits.at(-1))).toMatchObject({
    custom_key: 42, forecast: { type: 'hourly', temperature1_color: 'red', chart_height: 240, round_temp: true },
    units: { visibility: 'km' },
  });
  expect(await page.evaluate(() => original.forecast.type)).toBe('daily');
});

test('clears alternative sensors without dropping other config and restores the native weather value', async ({ page }) => {
  await page.getByRole('button', { name: 'Alternate entities', exact: true }).click();
  const temperature = page.getByLabel('Temperature', { exact: true });
  await temperature.fill('sensor.temperature');
  await temperature.press('Tab');
  expect(await page.evaluate(() => edits.at(-1).temp)).toBe('sensor.temperature');
  await page.evaluate(() => card.setConfig(edits.at(-1)));
  await expect(page.locator('weather-chart-card .main')).toContainText('19.7');
  await temperature.fill('');
  await temperature.press('Tab');
  expect(await page.evaluate(() => 'temp' in edits.at(-1))).toBe(false);
  await page.evaluate(() => card.setConfig(edits.at(-1)));
  await expect(page.locator('weather-chart-card .main')).toContainText('18.5');
});

test('settings remain usable without internal HA form components', async ({ page }) => {
  await page.getByLabel('Weather entity').selectOption('weather.other');
  await page.getByLabel('Chart style', { exact: true }).selectOption('style2');
  await page.getByRole('button', { name: 'Units', exact: true }).click();
  await page.getByLabel('Wind speed unit').selectOption('Bft');
  await page.getByLabel('Pressure unit').selectOption('inHg');
  expect(await page.evaluate(() => edits.at(-1))).toMatchObject({ entity: 'weather.other', forecast: { style: 'style2' }, units: { speed: 'Bft', pressure: 'inHg' } });
  expect(await page.evaluate(() => [...editor.shadowRoot.querySelectorAll('*')].filter(element => element.tagName.startsWith('HA-') || element.tagName.startsWith('MWC-')).length)).toBe(0);
});


test('updates native selection when HA supplies a new config and preserves zero numeric values', async ({ page }) => {
  await page.getByLabel('Forecast type', { exact: true }).selectOption('hourly');
  await page.evaluate(() => editor.setConfig({ entity: 'weather.other', forecast: { type: 'daily', precip_bar_size: 0 } }));
  await expect(page.getByLabel('Forecast type', { exact: true })).toHaveValue('daily');
  await expect(page.getByLabel('Weather entity')).toHaveValue('weather.other');
  await page.getByRole('button', { name: 'Forecast', exact: true }).click();
  await expect(page.getByLabel('Precipitation bar size (%)', { exact: true })).toHaveValue('0');
  await page.screenshot({ path: test.info().outputPath('editor.png'), fullPage: true });
});
