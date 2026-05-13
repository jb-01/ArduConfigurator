# Changelog

All notable changes to this fork are documented here. Versioning is lightweight
semantic versioning while the project is pre-1.0 (see `RELEASING.md`).

## v0.1.0-alpha — 2026-05-13

First tagged pre-release of the `jaw07/ArduConfigurator` fork. Scope: the work
that has accumulated on top of upstream since the fork was created, biased
toward making the browser configurator usable for FPV freestyle on 10" multirotors
and below.

### Highlights

- **Browser-first configurator**: Web Serial transport with a bundled WebSocket
  demo bridge and a MockTransport-driven demo mode. Disconnected landing screen
  lands users in a known state before connecting.
- **Per-view UI extraction**: Modes, Failsafe, Vtx, Osd, Power, Outputs, Presets,
  and Logs views are extracted from the monolithic `App.tsx` into typed
  presentational components under `apps/web/src/views/`.
- **Param metadata catalog**: 297 ArduCopter parameter entries, including all
  SERIAL/BRD_SER flow-control families, per-element OSD layout knobs for
  screens 1–4 (10 elements each), and a dedicated logging surface.
- **Multi-firmware start**: ArduPlane flight-mode label table and formatter
  stand alongside the ArduCopter catalog as the first piece of multi-firmware
  metadata.
- **Failsafe overview**: RC, battery, GCS, and EKF failsafe parameters are
  visible at a glance in a read-only Failsafe view with deep-links to Power.
- **Logs overview**: New Logs view summarizes onboard log backend, retention,
  and replay configuration, deep-linking to the Parameters editor for edits.
- **CI on the fork**: Typecheck + node:test + Playwright e2e run on every push
  and PR via GitHub Actions.

### Surface coverage

- Setup / guided calibration (accelerometer, compass) with confirm-driven mock.
- Ports (serial protocol, baud, options, flow control).
- VTX and OSD (backend, channel, switching, MSP options, per-element layout).
- Receiver, Modes, Outputs (with motor test slider and reorder dialog).
- Power and Failsafe (RC, battery low/critical, GCS, EKF, throttle).
- Snapshots, Presets, Tuning, Logs, and a low-level Parameters editor.

### Build / packaging

- `npm run build --workspace @arduconfig/web` produces a static SPA bundle under
  `apps/web/dist`, split into six vendor chunks (largest ~138 KB gzipped) via
  Rollup `manualChunks`.
- `npm run desktop:app` produces the Electron preview shell; not a polished
  installer pipeline yet.

### Testing

- `npm run typecheck` covers all eight workspaces.
- `npm test` (node:test) covers the protocol, mock scenario, snapshot/restore,
  guided calibration flows, board catalog, and metadata bindings.
- `npm run test:e2e` (Playwright) covers landing, Modes, Failsafe, Logs view,
  motor test, snapshots/presets round-trip, and bundled WebSocket bridge flow.
- `npm run test:sitl` is wired but opt-in via `ARDUPILOT_REPO_PATH` or
  `ARDUPILOT_SITL_HOST/PORT`.

### Session 2026-05-13 (final push before tagging)

The last seven PRs landed on the same day and define the surface area of the
v0.1.0-alpha tag:

- **#28** — Surface GCS and EKF failsafe rows in the Failsafe view.
- **#29** — Add `FS_GCS_ENABLE`, `FS_EKF_ACTION`, `FS_EKF_THRESH` to the demo
  mock scenario so the new rows render with realistic values.
- **#30** — Add an `ArduPlane` flight-mode label table and formatter
  (`arduplaneFlightModeLabel`, `formatArduplaneFlightMode`) as the first piece
  of multi-firmware metadata.
- **#31** — Surface per-element OSD1 layout parameters in the metadata catalog
  via a small generator pattern (`OSD1_*_EN/X/Y` for the five highest-value FPV
  elements).
- **#32** — Extend the OSD generator to screens 2/3/4 and add five more
  elements (heading, ground speed, home arrow, artificial horizon, flight
  mode). Catalog goes from 15 → 120 OSD layout entries.
- **#33** — Add onboard logging metadata under a dedicated `logging` category,
  including a `LOG_BACKEND_TYPE` enum table and formatter.
- **#34** — Add a read-only Logs view surfacing the new LOG_* metadata as
  status cards and a parameter table, with a deep-link button that flips into
  expert mode and opens the Parameters editor for actual edits. Demo mock
  scenario seeded with sensible LOG_* defaults; two new Playwright specs
  cover the view.

### Known gaps and risks

- Logs surface is read-only; inline editor and log-download / list MAVLink
  surfaces are follow-ups.
- The OSD view does not yet render the per-element layout values from the
  catalog into the preview; only OSD backend/channel/switching are live.
- The `three-vendor` chunk lands at ~548 KB minified (~138 KB gzipped) because
  `flight-deck-preview.tsx` does `import * as THREE`. Tree-shaking is a
  follow-up.
- Pose-guide e2e calibration spec has historically been flake-prone on slow
  GitHub-hosted runners. The confirm-driven mock fix reduced this materially,
  but it remains the most likely retry trigger.
- Multi-firmware metadata is bootstrapped (Plane flight-mode labels only). A
  fuller `ArduPlane`/`ArduRover` catalog parallel to ArduCopter is future work.
- Desktop preview builds are not yet shipped as artifacts; treat any locally
  produced installer as preview-only.
