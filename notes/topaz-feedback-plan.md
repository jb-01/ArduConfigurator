# Topaz Feedback Implementation Plan

_Last updated: 2026-03-24_

This document turns the March 24 Topaz evaluation feedback into a concrete implementation plan for this repository.

It is the working source of truth for:

- issue-by-issue triage
- milestone sequencing
- scope decisions
- progress tracking for this feedback set

It complements, rather than replaces:

- `notes/project-status.md`
- `notes/betaflight-comparison.md`
- `notes/ui-redesign-brief.md`

## 1. Planning Rules

This plan should follow a few constraints so it stays technically coherent.

- Preserve the current shared runtime architecture instead of hard-coding product behavior into the web app.
- Prefer browser-feasible improvements first, then add desktop-only or protocol-heavy features where they are clearly worth the cost.
- Separate "product-shape" fixes from "new protocol capability" work so the app can improve visibly before larger infrastructure lands.
- Keep `Ports`, `VTX`, and `OSD` task-shaped. Do not push routine workflows back into raw parameter editing.
- Treat the Topaz fork's `ISSUES.md` as input, not as the implementation tracker. This file owns the repo-side execution status.

## 2. Triage Summary

Recommended milestone order:

1. `M1` Session UX and form legibility
2. `M2` Ports usability and correctness
3. `M3` Dedicated FPV configuration surfaces
4. `M4` Hardware-aware board integration and developer tooling
5. `M5` Flight deck cleanup
6. `M6` Repo and transport follow-up

Why this order:

- `M1` and `M2` address the strongest immediate usability complaints without requiring new protocol work.
- `M3` makes the product feel materially closer to an FPV configurator by giving `VTX` and `OSD` first-class homes.
- `M4` is valuable, but it depends on new capability such as MAVFTP and board metadata management.
- `M5` should happen after higher-leverage setup/configuration improvements unless flight deck work becomes user-blocking.
- `M6` contains real work, but it should not distort the product roadmap.

## 3. Issue Triage

| Topaz # | Title | Decision | Milestone | Notes |
|---|---|---|---|---|
| 1 | Ansible and scripts directories added but only ansible tested | Defer | `M6` | Repo hygiene item, not core product feedback. Track separately from user-facing work. |
| 2 | Connection UI not obvious | Accept | `M1` | Re-open the current sidebar-first decision. Move primary connect controls into a header session strip and demote sidebar diagnostics. |
| 3 | Default to serial and auto-reconnect last port | Accept with browser constraints | `M1` | Use `navigator.serial.getPorts()` plus persisted transport choice. Still respect browser permission limits. |
| 4 | Transport dropdown text low contrast | Accept | `M1` | Fold into a single global form-contrast pass. |
| 5 | Add native TCP / UDP / UDP client-initiated transports | Partial / Defer | `M6` | Not browser-native. Scope this as desktop or bridge-backed transport expansion, not as direct browser parity. |
| 6 | Copter diagram initially faces wrong direction | Accept | `M5` | Small fix, but lower leverage than connection and ports work. |
| 7 | Gimbal lock in attitude rendering | Accept | `M5` | Convert internal rotation math to quaternions if the preview remains a product surface. |
| 8 | Replace compass rose and artificial horizon with HUD heading tape | Defer until flight deck redesign | `M5` | Worth doing only as part of a coherent preview redesign, not as a one-off widget swap. |
| 9 | Pull UART mapping via MAVFTP (`uarts.txt`) | Accept | `M4` | High value for board-aware ports, but requires new runtime capability. |
| 10 | MAVFTP file browser in Developer Mode | Accept, staged | `M4` | Start with read-only browsing/download once MAVFTP exists; add upload/delete only after the protocol layer is stable. |
| 11 | Board photos and pinout images in Ports tab | Accept | `M4` | Depends on a board catalog and media strategy. |
| 12 | Manufacturer and wiki doc links per board | Accept | `M4` | Bundle with board catalog work from `#11`. |
| 13 | All dropdown text globally low contrast | Accept | `M1` | Fix once at the app-shell / form-control layer. |
| 14 | Dedicated VTX tab | Accept | `M3` | Add first-class `VTX` view instead of burying it inside `Ports`. |
| 15 | Primary GPS shows Unknown despite reporting coordinates | Accept | `M2` | The current view needs clearer configured-type vs live-status handling. |
| 16 | GPS2 shows Unknown when unconfigured | Accept | `M2` | Normalize disabled/unconfigured display states in `Ports`. |
| 17 | Dedicated OSD tab with live editor | Accept | `M3` | High-value FPV workflow. MVP should focus on layout and parameter mapping before deep parity ambitions. |
| 18 | Ports tab rows too large | Accept | `M2` | Rework `Ports` into compact rows that fit typical boards on one screen. |
| 19 | Human-readable `SERIALn_OPTIONS` editor | Accept | `M2` | Add metadata + UI abstraction for the bitmask. Never expose raw bit values in the primary UI. |
| 20 | Custom/high baud rates display incorrectly | Accept | `M2` | Add proper ArduPilot baud encode/decode logic plus preset/custom UI. |

## 4. Milestones

### `M1` Session UX and Form Legibility

Goal:

- Make connection state obvious and the app shell feel product-grade instead of prototype-like.

Scope:

- Move primary connection controls into a header session strip.
- Persist the last selected transport mode.
- Default to serial transport on first load.
- Attempt reconnect to previously approved serial ports when the browser exposes them.
- Fix global select/dropdown contrast in the shell and configuration forms.

Likely code areas:

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `packages/transport/src/web-serial-transport.ts`

Validation:

- Playwright coverage for header connect flow and reconnect presentation.
- Manual browser verification for previously granted serial-port discovery.

### `M2` Ports Usability and Correctness

Goal:

- Make `Ports` feel like a hardware-configuration surface instead of a stack of tall cards and raw values.

Scope:

- Replace the current card-heavy layout with compact port rows.
- Fix GPS disabled / unknown labeling.
- Separate "configured type" from any live detection status the app can actually prove.
- Add human-readable `SERIALn_OPTIONS` display and editing.
- Add proper ArduPilot baud encode/decode logic with preset and custom entry paths.

Likely code areas:

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `packages/param-metadata/src/arducopter.ts`
- `packages/param-metadata/src/arducopter-enums.ts`
- shared helpers in `packages/ardupilot-core`

Validation:

- Unit tests for baud formatting and serial-options bitmask translation.
- Playwright checks that common port layouts fit without excessive scrolling.
- Regression checks that port edits still flow through verified write/readback paths.

### `M3` Dedicated FPV Configuration Surfaces

Goal:

- Give `VTX` and `OSD` first-class task surfaces so the product feels closer to an FPV configurator.

Scope:

- Add `VTX` app view and move existing VTX configuration out of `Ports`.
- Add `OSD` app view and establish an MVP editor with layout preview, screen-mode selection, and parameter-backed placement controls.
- Keep Betaflight-inspired task flow, but stay explicit where ArduPilot capability is missing.

Likely code areas:

- `apps/web/src/App.tsx`
- `packages/param-metadata/src/types.ts`
- `packages/param-metadata/src/arducopter.ts`

Validation:

- Playwright coverage for `VTX` and `OSD` navigation and save/apply paths.
- Snapshot regression coverage to ensure these surfaces remain reversible.

### `M4` Hardware-Aware Board Integration and Developer Tooling

Goal:

- Make `Ports` board-aware instead of generic, and add the minimum protocol/tooling needed to support that.

Scope:

- Add MAVFTP transport/runtime support.
- Fetch and interpret `uarts.txt` for UART-to-`SERIALn` mapping.
- Add a board catalog with manufacturer links, ArduPilot wiki links, and image references.
- Add Developer Mode MAVFTP browsing, staged behind a stable protocol layer.

Likely code areas:

- `packages/protocol-mavlink`
- `packages/ardupilot-core`
- `apps/web/src/App.tsx`
- a new board metadata module under `packages/param-metadata` or a dedicated package if it grows

Validation:

- Integration tests against replay or SITL fixtures for MAVFTP operations where possible.
- Manual checks against at least one real board family before calling this complete.

### `M5` Flight Deck Cleanup

Goal:

- Fix known preview issues without letting this work sprawl ahead of higher-value setup/configuration tasks.

Scope:

- Correct the initial craft orientation.
- Move internal rotation handling to quaternions.
- Revisit the heading / horizon presentation as one coherent redesign.

Likely code areas:

- `apps/web/src/flight-deck-preview.tsx`

Validation:

- Manual visual verification across representative attitude extremes.
- Add focused rendering or math tests if the refactor introduces reusable helpers.

### `M6` Repo and Transport Follow-Up

Goal:

- Close lower-priority but real follow-up items after the core product changes are in place.

Scope:

- Validate and land any repo-side tooling that is worth keeping from the Topaz worktree.
- Revisit TCP / UDP transport expansion only in a form the architecture can actually support cleanly.

Notes:

- For browser delivery, raw TCP / UDP is not a realistic direct target.
- If these transports matter, implement them through the desktop shell or a documented local bridge.

## 5. Cross-Cutting Implementation Strategy

To keep the work from collapsing back into one large `App.tsx` edit, use this sequence:

1. Extract the session strip and the current `Ports` surface into clearer UI slices before adding new behavior.
2. Land low-risk correctness helpers first:
   - serial baud encode/decode
   - serial option bitmask metadata
   - display-state normalization for disabled peripherals
3. Add new app views only after the underlying task models are stable.
4. Add MAVFTP only when there is a concrete consumer ready to use it (`uarts.txt`, board-aware labeling, developer browser).

## 6. Open Questions

- Should the new connection strip fully replace sidebar controls, or should the sidebar keep a secondary diagnostics-only session panel?
- What is the smallest acceptable `OSD` MVP: layout preview only, or preview plus drag-and-drop persistence?
- Where should board metadata live if it expands beyond two initial targets?
- How much of the Betaflight interaction model should be treated as direct parity vs inspiration?
- Is any part of `#5` required for browser users, or is desktop/bridge support sufficient?

## 7. Progress Log

### 2026-03-24

- Created this plan from the Topaz fork's `topaz-notes/ISSUES.md`.
- Mapped all 20 Topaz items into repo-side decisions and milestone targets.
- Chose one dedicated execution tracker instead of spreading this work across older planning docs.
- Landed `M1` shell work:
  - moved primary connect controls into a header session strip
  - defaulted supported browsers to serial on first load
  - persisted transport choice, WebSocket URL, and the last approved serial port
  - added browser-feasible serial auto-reconnect via `navigator.serial.getPorts()`
  - fixed default select / option contrast across the shell
- Landed most of `M2`:
  - rebuilt `Ports` into compact rows
  - added human-readable `SERIALn_OPTIONS` metadata and editing
  - corrected ArduPilot serial protocol labels and baud encode/decode behavior
  - moved GPS labeling toward configured-driver vs live-position clarity
- Landed the first `M3` FPV surfaces:
  - added dedicated `VTX` and `OSD` app views
  - moved VTX / OSD configuration out of `Ports`
  - left explicit placeholders where upstream ArduPilot capability is still missing
- Landed `M5` flight-deck cleanup:
  - corrected the craft preview orientation so the nose faces up-screen
  - moved internal attitude rendering from Euler composition to quaternion interpolation
  - replaced the separate compass / horizon instruments with an integrated HUD-style heading tape and compact readouts
  - added a bench-forward heading reset so the live preview can be zeroed to the operator's desk orientation without changing board alignment
- Landed the first `M4` hardware-aware pass:
  - added `AUTOPILOT_VERSION` and `FILE_TRANSFER_PROTOCOL` support to the shared MAVLink codec/message layer
  - added read-only MAVFTP in the shared runtime, scoped to fetching and parsing `@SYS/uarts.txt`
  - exposed board identity plus UART mapping on the runtime snapshot instead of keeping this logic in the web app
  - added a board catalog for the initial Topaz targets: `ARK FPV` and `Matek H743`
  - made `Ports` board-aware when `uarts.txt` is available, including hardware UART labels, board references, and manufacturer / wiki links
  - added a raw `uarts.txt` disclosure to the Ports sidebar as the first developer-facing MAVFTP surface
- Landed the second `M4` hardware-aware pass:
  - expanded the shared MAVFTP runtime from `uarts.txt` reads to full `@SYS` directory browse, file download, upload, and delete operations
  - added an Expert-only Developer MAVFTP browser inside the Parameters view with path navigation, upload, download, delete, and `@SYS/scripts` traversal
  - replaced the Ports sidebar's link-only board block with bundled inline media cards and a zoomable lightbox
  - expanded the board catalog beyond the first two targets to cover `Pixhawk 6X`, `ARKV6X`, and `CUAV-7-Nano` in addition to `ARK FPV` and `Matek H743`
  - hardened the browser demo path by emitting duplicate `PARAM_VALUE` confirmations on mock parameter writes so verified-write flows stay reliable under end-to-end load
- Landed a partial `M6` follow-up:
  - extended the desktop WebSocket bridge to front TCP, UDP listen, and UDP client-initiated sources using the existing desktop-only transport layer
- Verified the current pass with `npm run test` and `npm run test:e2e`.
