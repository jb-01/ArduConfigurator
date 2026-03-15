# Architecture

## Goal

Build a browser-first ArduPilot configurator with a reusable TypeScript core, so the protocol/runtime work is not trapped inside a single UI.

## Layering

The repository is organized into explicit layers.

### Transport

`packages/transport`

Responsibilities:

- byte transport lifecycle
- connection status
- frame send/receive

Current transport paths:

- `MockTransport`
- `WebSerialTransport`
- `WebSocketTransport`
- `ReplayTransport`
- native serial / TCP / UDP adapters in desktop-side tooling

`ReplayTransport` exists to make deterministic integration tests possible without requiring a live FC or a full SITL process.

### MAVLink / Session

`packages/protocol-mavlink`

Responsibilities:

- MAVLink v2 encode/decode
- streaming frame parsing
- message definitions
- session wrapper over transports

The session layer owns message sequencing and converts raw transport frames into typed MAVLink envelopes.

### ArduPilot Runtime

`packages/ardupilot-core`

Responsibilities:

- heartbeat-driven vehicle identity
- parameter sync/write/readback
- guided actions
- live verification state
- pre-arm issue state
- snapshots/backups
- presets
- setup exercises
- motor-test guardrails

This is the main reusable behavior layer. The web app and desktop tooling both depend on it.

### Metadata Catalog

`packages/param-metadata`

Responsibilities:

- grouped product views
- curated parameter definitions
- enums/labels/units/ranges
- reboot requirements
- view/category mapping

The current metadata is curated rather than exhaustive. Broadening and normalizing it is one of the main remaining product tasks.

### App Surfaces

#### Web

`apps/web`

The web app is the primary product surface. It currently supports:

- demo transport
- browser `Web Serial`
- browser `WebSocket`

The web app is intentionally the main place where end users should be able to complete setup and configuration.

#### Desktop

`apps/desktop`

The desktop side currently provides:

- a thin Electron shell that hosts the same web UI over localhost
- native serial access
- live FC runtime tooling
- true SITL launch/attach tooling
- snapshot CLI flows

It is no longer only a CLI/runtime surface: there is now a thin desktop shell for continuing browser work inside a native window. It is still not a packaged/distributed desktop product, and the long-term goal remains a thin wrapper around the same shared web/core stack rather than a divergent desktop app.

## Validation Stack

There are four main validation layers.

### 1. Mock Runtime

Fast deterministic tests around the shared runtime using mock transports and mock SITL behavior.

### 2. Replay Sessions

Recorded-session replay using `ReplayTransport` for deterministic transport/runtime validation without live hardware.

### 3. True SITL

Direct-binary ArduPilot SITL validation through `packages/sitl-harness`.

Current recommendation:

- prefer `direct-binary`
- treat `sim_vehicle.py` as an environment-dependent compatibility path

### 4. Live FC

Browser and desktop validation against real hardware for the workflows that matter most:

- connection/sync
- configuration writes
- setup flows
- snapshots/presets
- guarded motor test

## Current Architectural Gaps

- no bundled WebSocket bridge/server path yet
- desktop packaging/distribution not built yet
- metadata coverage still too thin overall
- snapshot-library management is still split between strong web UI and desktop CLI tooling

## Design Constraints

- browser-first
- shared core logic first
- configuration-first UX
- narrow, explainable tuning
- safe write/readback/restore behavior
