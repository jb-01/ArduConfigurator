# Betaflight UI Redesign Brief

_Last updated: 2026-03-25_

## Objective

Redesign ArduConfigurator so it is recognisably close to Betaflight Configurator for FPV users while preserving ArduPilot runtime behavior, safety checks, metadata, and hardware-specific capability.

This branch is not a generic modernization effort. The target is specifically:

- Betaflight-shaped UI
- ArduPilot underneath
- minimal switching cost for current Betaflight users

## Source Inputs

This brief is derived from:

- [betaflight-ui-source-map.md](/Users/joshuabelofsky/Research/ArduConfigurator/docs/betaflight-ui-source-map.md)
- [betaflight-ui-gap-analysis.md](/Users/joshuabelofsky/Research/ArduConfigurator/docs/betaflight-ui-gap-analysis.md)
- the official Betaflight Configurator clone at `/tmp/betaflight-configurator-upstream`

## Core Correction

The redesign must stop treating "Betaflight-like" as a dark theme problem.

The real target is:

- dark chrome around the app
- light neutral content surfaces by default
- compact utility typography
- repeated titled boxes
- fixed bottom save bars
- task templates that mirror Betaflight tab anatomy

If we keep our current dark dashboard language, the app will still feel like ArduConfigurator even with Betaflight-inspired tab names.

## Visual Direction

### Palette

Match Betaflight's default surface hierarchy more closely.

- shell chrome: darker neutral gray
- tab rail chrome: neutral gray slightly darker than content
- content canvas: light neutral gray
- control surfaces: light-to-mid neutral gray
- borders: soft grayscale, not blue-tinted
- accent: amber/yellow
- primary action: bright green for connect/save/apply
- warning: orange
- danger: red-pink

Do not use our current all-dark content treatment as the primary branch direction.

### Typography

Match Betaflight's practical typography more closely.

- primary UI font should move close to `Open Sans` in feel, ideally `Open Sans` itself for parity
- base UI sizing should stay around the Betaflight compact desktop range
- tab titles should be large, simple, and low-weight with an amber underline
- avoid mono-heavy presentation except for specific data readouts

### Components

Promote these to shared visual primitives:

1. `tab_title`
2. `note`
3. `gui_box`
4. `gui_box_titlebar`
5. fixed bottom `content_toolbar`
6. icon-first tab rail item

Do not continue inventing new one-off card patterns for each major surface.

## Shell Rules

### Header

The top header must become a hardware utility bar.

Required composition:

1. compact product mark and version/hardware identity
2. transport / port picker immediately nearby
3. battery / sensor / session state cluster
4. expert mode or comparable compact mode toggle
5. high-emphasis connect and flash/apply actions at the right edge

Avoid:

- large segmented textual summary groups
- oversized session strip framing
- header content that reads like a dashboard status banner

### Left Rail

The left rail must become a compact icon-first tab list.

Required characteristics:

- single navigation purpose
- icon plus label on each row
- pill active state
- minimal surrounding explanatory framing
- no large summary cards inside the rail

Preferred visible order:

1. `Setup`
2. `Ports`
3. `Configuration` or equivalent ArduPilot grouping if needed
4. `Power`
5. `Presets`
6. `Receiver`
7. `Modes`
8. `Outputs`
9. `OSD`
10. `VTX`
11. `Snapshots`
12. `Tuning`
13. `Parameters` in Expert mode

The ordering can stay ArduPilot-aware, but the visual shape should still read like a Betaflight tab rail.

### Main Content Header

Each tab should open with:

- large tab title
- wiki/help affordance near the title
- optional compact note blocks immediately below

Avoid:

- extra eyebrow bars
- large tab-summary headers
- dashboard-style hero intros

## Tab-Specific Targets

### Setup

Target the actual Betaflight Setup anatomy:

1. top action rows:
   - button on the left
   - short explanation on the right
2. center model stage on graph-paper-like background
3. visible bench-heading reset near the model
4. narrow side stack of titled utility boxes:
   - instruments
   - GPS
   - info
   - sensors
   - optional build/features

Guided ArduPilot setup should still exist, but it should be a subordinate affordance within this page, not the page's dominant structure.

### Ports

Target the actual Betaflight Ports shape:

1. top note block if needed
2. dense real table
3. one row per UART
4. grouped role columns rather than a generic function editor
5. fixed bottom apply/save bar

For ArduPilot, the likely column model is:

- `Port`
- `Configuration / Console`
- `Receiver`
- `Telemetry`
- `Sensors`
- `Peripherals`

The UI can still map these to `SERIALn_PROTOCOL`, `SERIALn_BAUD`, `SERIALn_OPTIONS`, and `BRD_SERx_RTSCTS` internally.

### VTX

Target the Betaflight VTX page anatomy:

1. note/support blocks
2. main configuration box
3. smaller actual-state box
4. lower table/status box
5. fixed bottom save bar

### OSD

Target the Betaflight OSD page anatomy:

1. left column: element inventory and profile toggles
2. center column: live preview canvas and preview controls
3. right column: profile/video/unit/settings boxes
4. fixed bottom save bar

The current OSD settings-only page is not acceptable as the final redesign target.

## Interaction Rules

### Copy

Copy should be shorter and more utilitarian.

- prefer direct labels and short notes
- use note blocks for caveats
- remove long descriptive hero copy from primary tabs

### Density

The redesign should be denser than the current branch.

- smaller paddings
- tighter row heights
- more table-driven presentation
- fewer stacked summary cards

### Save / Apply

Editable tabs should converge on a shared fixed bottom toolbar pattern.

- green apply/save action
- compact secondary discard/cancel action
- consistent placement across editable tabs

## Non-Negotiables

These must be true before this branch can claim Betaflight closeness:

1. default work surfaces are light-neutral, not full dark
2. the header is hardware/control-first
3. the rail is icon-first and navigation-only
4. Setup follows Betaflight's bench-tool structure
5. Ports is a grouped-role table, not a custom card matrix
6. VTX and OSD follow Betaflight page anatomy
7. reusable Betaflight-like box and toolbar primitives are shared across tabs

## Implementation Order

1. rebuild shell and global tokens
2. introduce shared Betaflight-like primitives
3. rebuild Setup
4. rebuild Ports
5. rebuild VTX
6. rebuild OSD
7. then revisit secondary tabs for consistency
