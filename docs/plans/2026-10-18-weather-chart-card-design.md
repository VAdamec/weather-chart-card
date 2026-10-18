# Weather Chart Card compatibility refactor

Approved by the user on 2026-10-18. Target: Home Assistant 2026.10.

## Problem and approach

Retain the existing card and YAML configuration rather than rewrite it. Fix
resource ownership and missing-data failures; replace removed HA editor internals
with themed, accessible native inputs. Preserve Main, Forecast, Units and Alternate
entities settings pages. This avoids depending on internal HA form components.

## Boundaries and responsibilities

- Card owns one forecast subscription per connection/entity/type, a clock timer,
  an hourly autoscroll timeout, a ResizeObserver and a Chart.js instance.
- Disconnect/configuration changes invalidate pending subscription results. Stale
  callbacks cannot update the current card. Disconnect releases all resources.
- Rendering has no timer or subscription side effects. Clock ticks update only
  clock text; they do not recreate the chart.
- One forecast selection path filters expired items before slicing and supplies
  chart values, tooltips, condition icons and wind rows consistently.
- Editor emits immutable config-changed events, preserves unknown YAML keys and
  nested options, and stores numeric inputs as numbers and switches as booleans.
- Build bundles dependencies as a browser ES module with embedded animated SVG icons (HACS can install a single JavaScript file).

## Errors and compatibility

Unavailable weather, absent sun/alternate entities, empty forecasts and rejected
subscriptions must not throw. Keep entity IDs, supported settings, chart styles,
localization and custom icon paths. Unsupported forecasts show a readable status.
Existing configured values continue to work; no device or live HA changes.

## Acceptance criteria

Browser tests exercise connect/disconnect/reconnect, pending subscriptions,
connection/entity/type changes, errors and retry, one clock timer, autoscroll,
chart cleanup, empty/missing data, filtered forecast alignment, both chart styles,
editor defaults, nested edits, alternate sensors and custom keys. Build and lint
pass. The committed lockfile supports npm ci. HACS bundle loads without external
JS dependencies. CI runs lint/build/browser regression tests.

## Implementation sequence

1. Fix lifecycle, data normalization and forecast selection in main.js.
2. Replace editor internals while retaining all settings and page navigation.
3. Refresh build dependencies and add browser regression fixtures and CI.
4. Run tests/build, inspect a rendered fixture and document installation/limits.

## Validation boundary

Browser fixtures simulate the HA state and WebSocket API. Real HA 2026.10,
provider-specific payloads, themes and HACS installation require live validation.
No writing-plans skill is installed in this environment; this sequence is the
implementation plan for the approved design.
