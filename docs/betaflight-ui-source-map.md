# Betaflight UI Source Map

_Last updated: 2026-03-24_

This branch uses the official Betaflight Configurator as the primary UI and UX reference for the redesign track requested by JH:

- close the visual and interaction gap with Betaflight Configurator
- keep full ArduPilot support and product behavior
- prefer familiar FPV-configurator workflows over novel layout experiments

Companion analysis:

- `docs/betaflight-ui-gap-analysis.md`
  - code-to-code comparison between the current ArduConfigurator UI and Betaflight
  - identifies the actual structural and interaction-model gaps to close on this branch
- `docs/betaflight-ui-redesign-brief.md`
  - explicit redesign targets for shell, palette, density, naming, and tab behavior
  - implementation brief for the `design/betaflight-ui-redesign` branch

## Upstream Reference

Official upstream clone used for this work:

- `/tmp/betaflight-configurator-upstream`

Verified source:

- remote: `https://github.com/betaflight/betaflight-configurator.git`
- branch: `master`
- current inspected commit: `4c7c3dd` (`UI: Responsive header bar (#4920)`)

## Primary Shell References

These files define the overall Betaflight application feel and should guide the first-pass redesign of our shell.

- `src/index.html`
  - desktop app shell
  - top header bar
  - left tab rail
  - port picker and connect button placement
- `src/css/main.less`
  - header bar styling
  - left rail tab density
  - icon treatment
  - main workspace framing
- `src/js/vue_components.js`
  - tab registry
  - product surface inventory
- `src/js/main.js`
  - tab switching behavior
  - active-tab state
  - shell interaction rules

## High-Value Tab References

These files are the clearest source for the product-shape JH is asking us to approach.

- `src/components/tabs/SetupTab.vue`
  - setup surface structure
  - calibration actions
  - 3D craft preview plus instrument panel
  - compact live information blocks
- `src/components/tabs/PortsTab.vue`
  - dense serial port table
  - role-first editing model
  - one-screen hardware workflow
- `src/components/tabs/VtxTab.vue`
  - dedicated FPV transmitter workflow
  - configuration panel plus current-state panel
  - table-oriented advanced setup
- `src/components/tabs/OsdTab.vue`
  - dedicated OSD workflow
  - drag-and-drop preview
  - dense element list plus preview plus settings column

## Adaptation Rules For ArduConfigurator

We should copy the following from Betaflight as directly as practical:

- desktop configurator framing
- clear top connection strip
- dense left navigation rail with icon plus label
- task-shaped surfaces instead of generic card dashboards
- compact, information-dense setup panels
- FPV-native `Ports`, `VTX`, `OSD`, `Receiver`, and `Motors` workflows

We should not blindly copy the following:

- Betaflight-specific wording where ArduPilot concepts differ
- assumptions that MSP, Betaflight VTX tables, or Betaflight OSD semantics map one-to-one to ArduPilot
- workflows that bypass our verified parameter write and rollback model
- shell choices that would hide ArduPilot-only capabilities like snapshots, board-aware Ports, MAVFTP, or guided setup

## Concrete Redesign Targets On This Branch

The first redesign pass should focus on:

1. Rebuilding the app shell to feel much closer to Betaflight.
2. Reworking Mission Control and Setup into a denser Setup-first surface.
3. Tightening Ports so it reads like a Betaflight-style port matrix with ArduPilot metadata layered in.
4. Moving VTX and OSD closer to Betaflight task flow while preserving the current ArduPilot-backed behavior.

## Mapping Back To Our Repo

The main ArduConfigurator files that will likely change first are:

- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/flight-deck-preview.tsx`

If the redesign gets too large for `App.tsx`, split shell and task surfaces into focused UI slices before expanding behavior further.
