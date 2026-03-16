# ArduConfigurator

Browser-first ArduPilot configurator focused on setup and configuration for ArduCopter-first FPV workflows.

The project is aiming at the same category as `app.betaflight.com`, but for ArduPilot:

- web-first UI
- reusable TypeScript core/runtime
- safe configuration workflows
- narrow, curated tuning instead of a raw-parameter-first experience

## Current State

The repository is beyond prototype stage, but not finished.

What is already real:

- browser `Web Serial` connection
- browser `WebSocket` connection to either an external MAVLink-over-WebSocket endpoint or the bundled local bridge started with `npm run bridge:websocket`
- a thin Electron desktop shell that hosts the same web app over localhost, including native snapshot-library open/save/export dialogs inside the shared `Snapshots` view
- real MAVLink v2 framing/parsing
- shared runtime for sync, writes, guided setup, snapshots, and presets
- live FC validation in the browser for `Ports`, `Receiver`, `Outputs`, `Snapshots`, `Presets`, and guarded motor test
- automated mock, replay-session, and true SITL validation paths

What is still missing:

- broader metadata/configuration coverage
- packaging/distribution for the desktop shell
- release automation and packaged desktop artifacts

## Product Shape

The app is intentionally configuration-first.

Primary views today:

- `Setup`
- `Ports`
- `Receiver`
- `Outputs`
- `Power`
- `Snapshots`
- `Tuning`
- `Presets`
- `Parameters` (`Expert` mode)

The current tuning scope is intentionally narrow and curated. The main product focus remains setup, configuration, safety, and recoverability.

## Workspace Layout

- `apps/web`: browser UI
- `apps/desktop`: thin Electron shell plus native adapters, CLI/runtime tooling, and SITL/live validation entrypoints
- `packages/transport`: transport adapters including mock, Web Serial, WebSocket, and replay
- `packages/protocol-mavlink`: MAVLink codec and session layer
- `packages/ardupilot-core`: runtime, setup logic, snapshots, presets, motor-test guardrails
- `packages/param-metadata`: metadata catalog, grouped views, curated parameter coverage
- `packages/mock-sitl`: deterministic mock runtime harness
- `packages/sitl-harness`: true ArduPilot SITL launch/attach utilities
- `tests`: integration and regression tests against built packages

## Quick Start

Install dependencies:

```bash
npm install
```

Run the web app:

```bash
npm run dev:web
```

Run the thin desktop shell against the built web app:

```bash
npm run desktop:app
```

Run the thin desktop shell against the web dev server:

```bash
npm run dev:web
npm run desktop:app:dev
```

Run typecheck:

```bash
npm run typecheck
```

Run the full automated suite:

```bash
npm run test
```

Run true SITL validation with a local ArduPilot checkout:

```bash
ARDUPILOT_REPO_PATH=/path/to/ardupilot npm run test:sitl
```

## Validation Paths

- Mock runtime: fast regression coverage without hardware
- Replay transport: deterministic recorded-session validation without a live FC or SITL process
- True SITL: direct-binary ArduPilot validation for real write/readback behavior
- Live FC: browser `Web Serial` and desktop runtime validation against actual hardware

Use the mock runtime, replay transport, true SITL, and live FC paths above as the validation ladder for changes, starting with the lowest-risk option that can prove the behavior.

## Safety

- Treat any live FC as a real aircraft, not a disposable dev board.
- Use read-only validation first.
- Do not run motor tests with propellers installed.
- Use snapshots/backups before risky live validation.

## Key References

- Architecture overview: [ARCHITECTURE.md](ARCHITECTURE.md)
- Contributor workflow: [CONTRIBUTING.md](CONTRIBUTING.md)
- Release and packaging guidance: [RELEASING.md](RELEASING.md)
- Support process: [SUPPORT.md](SUPPORT.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Community expectations: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## License

This repository is licensed under [GNU GPL v3.0 only](LICENSE).

The rotating craft preview models in [apps/web/public/models](apps/web/public/models) were copied from the Betaflight Configurator project and remain subject to their upstream GPL-compatible redistribution obligations. See [apps/web/public/models/ATTRIBUTION.txt](apps/web/public/models/ATTRIBUTION.txt).
