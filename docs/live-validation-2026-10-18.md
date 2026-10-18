# Live validation — Home Assistant 2026.10.2

Validated on 2026-10-18 in a real Home Assistant OS installation:

- Core 2026.10.2, Supervisor 2026.10.2, OS 18.3, Frontend 20260930.4.
- Existing Czech-language dashboard and dark theme retained.
- Daily and hourly forecasts rendered from a real weather provider.
- Both chart styles and embedded animated icons rendered correctly.
- Clock setting saved, verified after reopening the editor, then restored.
- Navigating away removed the card; returning restored forecasts and the clock.
- Five forecast columns rendered in an approximately 339px-wide dashboard card.
- No card-specific console errors in the final navigation check.
- Downloaded the served bundle over verified HTTPS and checked that its SHA-256
  matched the locally tested build:
  `01e7c0e1c93d6d6daa9800c4e49e19bdc8bbe757dcef58b12e74d5154a251d93`.

The release changes only the help URL and package/repository metadata relative to
that tested build; browser regression CI also runs on the release source.
The public report excludes local hostnames, dashboard URLs and household details.

## Validation limits

Network loss, unavailable weather entities, missing sun and alternate sensors
were tested in the browser regression fixtures rather than by changing the live
HA instance. No physical-device or automation settings were changed.
HACS installation of this fork is a separate deployment step.
