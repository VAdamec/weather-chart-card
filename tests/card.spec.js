import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.errors = errors;
  await page.goto('/');
  await page.waitForFunction(() => window.ready);
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

async function mount(page, config = {}, options = {}) {
  await page.evaluate(([config, options]) => window.mount(config, options), [config, options]);
  await expect(page.locator('weather-chart-card')).toBeVisible();
  if (!options.deferred && !options.reject) await page.waitForFunction(() => window.card.forecastChart);
}

for (const style of ['style1', 'style2']) {
  test(`renders ${style} chart with aligned forecast rows and packaged icons`, async ({ page }) => {
    const failed = [];
    page.on('response', response => { if (!response.ok()) failed.push(response.url()); });
    await mount(page, { animated_icons: true, icon_style: style, forecast: { style, number_of_forecasts: 5, disable_animation: true } });
    await expect(page.locator('weather-chart-card .forecast-item')).toHaveCount(5);
    expect(await page.evaluate(() => card.forecastChart.data.labels.length)).toBe(5);
    await expect(page.locator('weather-chart-card .wind-detail')).toHaveCount(5);
    await expect.poll(() => page.evaluate(() => [...card.shadowRoot.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => [...card.shadowRoot.querySelectorAll('img')].every(image => image.src.startsWith('data:image/svg+xml,')))).toBe(true);
    const label = await page.evaluate(() => card.forecastChart.config.options.plugins.datalabels.formatter(
      10.333333333333334, { dataset: { data: [10.333333333333334] }, dataIndex: 0 }));
    expect(label).toBe('10.3°');
    expect(failed).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('card.png') });
  });
}

test('subscribes once and releases subscriptions/chart/observer on disconnect and reconnect', async ({ page }) => {
  await mount(page);
  await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) card.hass = { ...hass };
    await card.updateComplete;
    window.oldChart = card.forecastChart;
    card.remove();
  });
  expect(await page.evaluate(() => ({
    subscriptions: harness.subscriptions.length, unsubscribed: harness.subscriptions[0].unsubscribed,
    chart: card.forecastChart, observer: card.resizeObserver, destroyed: oldChart.canvas === null,
  }))).toEqual({ subscriptions: 1, unsubscribed: 1, chart: null, observer: null, destroyed: true });
  await page.evaluate(() => document.querySelector('#card-container').append(card));
  await page.waitForFunction(() => card.forecastChart && card.resizeObserver);
  expect(await page.evaluate(() => harness.subscriptions.length)).toBe(2);
});

test('cleans up pending subscription results and ignores obsolete callbacks', async ({ page }) => {
  await mount(page, {}, { deferred: true });
  await page.waitForFunction(() => harness.subscriptions.length === 1);
  await page.evaluate(() => {
    card.setConfig({ entity: 'weather.other', forecast: { type: 'hourly' } });
  });
  await page.waitForFunction(() => harness.subscriptions.length === 2);
  await page.evaluate(() => {
    harness.subscriptions[0].callback({ forecast: makeForecasts() });
    harness.subscriptions[0].resolve();
  });
  expect(await page.evaluate(() => card.forecasts.length)).toBe(0);
  await expect.poll(() => page.evaluate(() => harness.subscriptions[0].unsubscribed)).toBe(1);
  expect(await page.evaluate(() => harness.subscriptions[1].message)).toEqual({
    type: 'weather/subscribe_forecast', entity_id: 'weather.other', forecast_type: 'hourly',
  });
  await page.evaluate(() => { card.remove(); harness.subscriptions[1].resolve(); });
  await expect.poll(() => page.evaluate(() => harness.subscriptions[1].unsubscribed)).toBe(1);
});

test('resubscribes when the connection changes and ignores old provider events', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    const connection = { subscribeMessage: harness.connection.subscribeMessage.bind(harness.connection) };
    card.hass = { ...hass, connection };
  });
  await page.waitForFunction(() => harness.subscriptions.length === 2 && card.forecastChart);
  expect(await page.evaluate(() => harness.subscriptions[0].unsubscribed)).toBe(1);
  await page.evaluate(() => harness.subscriptions[0].callback({ forecast: [] }));
  expect(await page.evaluate(() => card.forecasts.length)).toBe(12);
});

test('reports rejected subscriptions and retries on the next HA update', async ({ page }) => {
  await mount(page, {}, { reject: true });
  await expect(page.getByRole('status')).toContainText('Forecast unavailable');
  await page.evaluate(() => { harness.reject = false; card.hass = { ...hass }; });
  await page.waitForFunction(() => card.forecastChart);
  expect(await page.evaluate(() => harness.subscriptions.length)).toBe(2);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('renders without sun or alternate sensors, including zero feels-like temperature', async ({ page }) => {
  await mount(page, { temp: 'sensor.missing', press: 'sensor.missing', show_feels_like: true, units: { pressure: 'inHg' } });
  await page.evaluate(() => { delete hass.states['sun.sun']; card.hass = { ...hass }; });
  await expect(page.locator('weather-chart-card .main')).toContainText('—');
  await expect(page.locator('weather-chart-card .feels-like')).toContainText('0°C');
  await expect(page.locator('weather-chart-card')).not.toContainText('NaN');
  await expect(page.locator('weather-chart-card .forecast-item')).not.toHaveCount(0);
});

test('handles empty/malformed forecasts and unavailable weather, then recovers', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => harness.subscriptions[0].callback({ forecast: [null, {}, { datetime: 'invalid' }] }));
  await expect(page.getByRole('status')).toContainText('No forecast data');
  expect(await page.evaluate(() => card.forecastChart)).toBe(null);
  await page.evaluate(() => {
    hass.states['weather.home'] = { ...hass.states['weather.home'], state: 'unavailable' };
    card.hass = { ...hass };
  });
  await expect(page.locator('weather-chart-card')).toContainText('weather.home is unavailable');
  expect(await page.evaluate(() => harness.subscriptions[0].unsubscribed)).toBe(1);
  await page.evaluate(() => { hass.states['weather.home'].state = 'sunny'; card.hass = { ...hass }; });
  await page.waitForFunction(() => card.forecastChart);
});

test('does not subscribe to unsupported forecasts', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => {
    hass.states['weather.other'].attributes.supported_features = 0;
    card.setConfig({ entity: 'weather.other' });
  });
  await expect(page.getByRole('status')).toContainText('does not support daily');
  expect(await page.evaluate(() => harness.subscriptions.length)).toBe(1);
  expect(await page.evaluate(() => card.forecastChart)).toBe(null);
});

test('owns one clock interval across rerenders and clears it on disable/disconnect', async ({ page }) => {
  await mount(page, { show_time: true, show_time_seconds: true });
  await expect(page.locator('weather-chart-card #digital-clock')).not.toBeEmpty();
  const initial = await page.evaluate(() => card._clockTimer);
  await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) { card.hass = { ...hass }; await card.updateComplete; }
  });
  expect(await page.evaluate(() => card._clockTimer)).toBe(initial);
  expect(await page.evaluate(() => harness.intervals.size)).toBe(1);
  await page.evaluate(() => card.setConfig({ entity: 'weather.home', show_time: false }));
  await expect.poll(() => page.evaluate(() => harness.intervals.size)).toBe(0);
  await page.evaluate(() => card.setConfig({ entity: 'weather.home', show_time: true }));
  await expect.poll(() => page.evaluate(() => harness.intervals.size)).toBe(1);
  await page.evaluate(() => card.remove());
  expect(await page.evaluate(() => harness.intervals.size)).toBe(0);
});

test('filters before slicing and keeps temperatures, tooltips, icons and wind aligned', async ({ page }) => {
  await mount(page, { autoscroll: true, forecast: { type: 'hourly', number_of_forecasts: 3, round_temp: true, disable_animation: true } });
  await page.evaluate(() => {
    const forecast = makeForecasts().slice(0, 4);
    forecast[0].datetime = new Date(Date.now() - 7200000).toISOString();
    delete forecast[2].templow;
    harness.subscriptions[0].callback({ forecast });
  });
  await expect.poll(() => page.evaluate(() => card.forecastChart.data.labels.length)).toBe(3);
  const data = await page.evaluate(() => card.computeForecastData());
  expect(data.tempHigh).toEqual([19, 19, 20]);
  expect(data.tempLow).toEqual([10, null, 11]);
  expect(data.forecast.map(item => item.datetime)).toEqual(data.dateTime);
  await expect(page.locator('weather-chart-card .forecast-item')).toHaveCount(3);
  await expect(page.locator('weather-chart-card .wind-detail')).toHaveCount(3);
});

test('autoscroll runs repeatedly and can be disabled and re-enabled', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-18T12:59:58Z') });
  await mount(page, { autoscroll: true, forecast: { type: 'hourly', disable_animation: true } });
  await page.clock.fastForward(5000);
  expect(await page.evaluate(() => Boolean(card.autoscrollTimeout))).toBe(true);
  await page.clock.fastForward(3600000);
  expect(await page.evaluate(() => Boolean(card.autoscrollTimeout))).toBe(true);
  await page.evaluate(() => card.setConfig({ entity: 'weather.home', autoscroll: false }));
  await expect.poll(() => page.evaluate(() => card.autoscrollTimeout)).toBe(null);
  await page.evaluate(() => card.setConfig({ entity: 'weather.home', autoscroll: true }));
  await expect.poll(() => page.evaluate(() => Boolean(card.autoscrollTimeout))).toBe(true);
  await page.evaluate(() => card.remove());
  expect(await page.evaluate(() => card.autoscrollTimeout)).toBe(null);
});

test('reflows at narrow widths and maintains at least one forecast', async ({ page }) => {
  await mount(page);
  await page.evaluate(() => { document.querySelector('#card-container').style.width = '80px'; });
  await expect.poll(() => page.evaluate(() => card.forecastItems)).toBe(1);
  await page.evaluate(() => { document.querySelector('#card-container').style.width = '600px'; });
  await expect.poll(() => page.evaluate(() => card.forecastItems)).toBe(9);
});


test('keeps the chart for unrelated HA updates and safely renders missing timestamps and numeric fields', async ({ page }) => {
  await mount(page, { show_last_changed: true, units: { pressure: 'inHg', speed: 'Bft' } });
  await page.evaluate(async () => {
    window.oldChart = card.forecastChart;
    card.hass = { ...hass };
    await card.updateComplete;
  });
  expect(await page.evaluate(() => oldChart === card.forecastChart)).toBe(true);
  await page.evaluate(() => {
    delete hass.states['weather.home'].last_changed;
    delete hass.states['weather.home'].attributes.pressure;
    delete hass.states['weather.home'].attributes.pressure_unit;
    delete hass.states['weather.home'].attributes.wind_speed;
    card.hass = { ...hass };
    harness.subscriptions[0].callback({ forecast: [{ datetime: new Date().toISOString(), condition: 'unrecognized' }] });
  });
  await expect(page.locator('weather-chart-card .updated')).toHaveCount(0);
  await expect(page.locator('weather-chart-card')).not.toContainText('NaN');
  await expect(page.locator('weather-chart-card')).not.toContainText('undefined');
  await page.waitForFunction(() => card.forecastChart);
});


test('keeps custom icon paths working without a trailing slash', async ({ page }) => {
  await mount(page, { icons: '/dist/icons', forecast: { disable_animation: true } });
  await expect.poll(() => page.evaluate(() => [...card.shadowRoot.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => card.shadowRoot.querySelector('img').getAttribute('src'))).toBe('/dist/icons/clear-day.svg');
});
