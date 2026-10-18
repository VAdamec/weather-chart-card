# Compatibility refactor

Target: Home Assistant 2026.10. [Live validation on 2026.10.2](live-validation-2026-10-18.md) completed on 2026-10-18. Existing `custom:weather-chart-card` YAML remains
valid. This is a maintained fork of the abandoned upstream project. The card keeps its two chart styles, translations, alternate sensors and
weather forecast WebSocket interface.

## Changes

- One subscription per connection/entity/forecast type. Reconfiguration and
  disconnect unsubscribe, including promises that resolve late. Old callbacks
  are ignored and failed subscriptions retry on the next HA state update.
- A single clock interval, hourly autoscroll, resize observation and Chart.js
  instance are cleaned up on disconnect. Reconnection recreates them.
- Missing sun/alternate entities, unavailable weather and empty forecasts render
  without exceptions. Zero temperatures remain visible.
- Expired forecasts are filtered before the display limit. Chart values, low
  temperatures, tooltips, condition icons and wind rows use the same selection.
- The visual editor uses native themed HTML controls and accessible labels,
  retains all four settings pages, preserves unknown YAML options, and emits
  immutable configuration updates. Optional toggles now reflect card defaults.
- A lockfile, lint rules, modern Rollup plugins and browser regression CI make
  builds reproducible. Built-in animated icons are embedded as SVG data URLs so
  HACS only needs `weather-chart-card.js`; existing custom icon URLs still work.

## Build and test

Use Node.js 22.13+ (CI uses Node.js 24):

```sh
npm ci
npx playwright install chromium
npm test
```

`npm test` runs lint/build and Playwright against `dist/weather-chart-card.js`.
If Google Chrome is already installed, `PLAYWRIGHT_CHROME=1 npm test` uses it.
`npm start` watches and rebuilds the bundle. The test server is local-only and
serves a synthetic HA fixture; it is not a development connection to your HA.

## Local installation for live validation

1. Back up your existing custom card file and YAML configuration.
2. Copy `dist/weather-chart-card.js` to a new folder such as
   `/config/www/weather-chart-card/weather-chart-card.js` on your HA host.
3. In Dashboard resources, temporarily replace the existing weather-chart-card
   resource with `/local/weather-chart-card/weather-chart-card.js?v=compat-202610`
   and type **JavaScript module**. Load exactly one copy of the card.
4. Reload the browser frontend. Existing cards should use their existing YAML.
5. Verify your provider's daily/hourly forecasts, both chart styles, editor
   changes/save/reopen, narrow/mobile layout and theme. Navigate away/back,
   change entity/type, and check the browser console for errors. Check disabled
   forecasts, unavailable entities, custom icons and unit conversions you use.

Copying these files or running the fixture does not install them through HACS.
For HACS distribution, publish the changes in a fork's default branch or release
and install that fork as a custom dashboard repository. The supplied `hacs.json`
keeps the single JavaScript filename. Use the custom-repository instructions in the README for HACS installation.

## Validation boundary

Automated browser checks use synthetic HA states and the forecast subscription
contract, with the outer `ha-card` shell simulated. They do not prove a live HA
2026.10 installation, actual provider behavior, theme integration, or HACS
installation. Selected real-instance checks have now passed; see the linked live validation report for exact coverage and remaining limits.

## Local verification on 2026-10-18

- `npm ci --ignore-scripts`: clean lockfile installation succeeded; npm reported
  zero dependency vulnerabilities.
- `PLAYWRIGHT_CHROME=1 npm test -- --workers=2`: lint and production build passed;
  all 20 browser regression tests passed using installed Google Chrome.
- Rendered card and editor screenshots were inspected. Temperature labels are
  limited to one decimal (or integer rounding when configured), without changing
  the underlying forecast values.
- `git diff --check`: passed. GitHub browser-test CI passed for the original refactor commit. Subsequent live HA checks are recorded in the linked report; HACS fork installation remains untested.

## API references

- [HA frontend input changes in 2026.4](https://contributors.home-assistant.io/blog/2026/03/25/frontend-component-updates-2026.4/)
- [HA frontend component changes in 2026.7](https://contributors.home-assistant.io/blog/2026/06/23/frontend-component-updates-2026.7/)
- [Forecast subscription contract](https://github.com/home-assistant/frontend/blob/dev/src/data/weather.ts)
