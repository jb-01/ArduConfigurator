# Betaflight UI Gap Analysis

_Last updated: 2026-03-25_

## Purpose

This document compares the current `design/betaflight-ui-redesign` branch against the official Betaflight Configurator source so the redesign can target the real UI/UX patterns that make Betaflight familiar to FPV users.

The important correction from this pass is simple:

- Betaflight familiarity does not come from "dark mode plus orange"
- it comes from a very specific desktop-configurator grammar
- our current branch still diverges because it keeps our card/dashboard language instead of reproducing that grammar

## Comparison Baseline

### ArduConfigurator files inspected

- `apps/web/src/App.tsx:6410-6889`
- `apps/web/src/App.tsx:7475-8194`
- `apps/web/src/styles.css:141-246`
- `apps/web/src/styles.css:395-499`
- `apps/web/src/styles.css:927-979`
- `apps/web/src/styles.css:1315-1582`
- `apps/web/src/styles.css:3587-3587`
- `apps/web/src/styles.css:4012-4129`

### Betaflight upstream inspected

- clone: `/tmp/betaflight-configurator-upstream`
- remote: `https://github.com/betaflight/betaflight-configurator.git`
- branch inspected: `master`
- inspected commit: `4c7c3dd` (`UI: Responsive header bar (#4920)`)

### Betaflight files inspected

- `src/index.html:18-256`
- `src/css/theme.css:7-80`
- `src/css/main.less:1-200`
- `src/css/main.less:259-500`
- `src/css/main.less:680-840`
- `src/css/main.less:971-1265`
- `src/css/tabs/ports.less:1-172`
- `src/components/betaflight-logo/BetaflightLogo.vue:1-87`
- `src/components/port-picker/PortPicker.vue:1-102`
- `src/components/tabs/SetupTab.vue:1-260`
- `src/components/tabs/SetupTab.vue:1206-1392`
- `src/components/tabs/PortsTab.vue:1-240`
- `src/components/tabs/VtxTab.vue:1-260`
- `src/components/tabs/OsdTab.vue:1-340`

## Executive Read

Betaflight is not structured like a dashboard. It is structured like a hardware utility:

1. fixed header chrome
2. fixed icon tab rail
3. light content canvas
4. repeated utility boxes with pill title bars
5. fixed save/apply bar on editable tabs

Our branch currently does this instead:

1. dark full-screen workspace shell
2. descriptive sidebar with summary cards
3. custom tab header framing
4. bespoke card systems per page
5. page-specific layouts that still read as our product first

That is why the current result still feels different even when the navigation order and feature names are closer.

## 1. Betaflight Shell Anatomy

### Header

Betaflight's header is a dense hardware-session strip, not a summary banner.

- `src/index.html:19-120` places logo, port picker, quad status, sensor status, dataflash/expert controls, and two circular action buttons in one bar.
- `src/css/main.less:278-406` styles that bar as compact chrome with the connect button and flasher button as high-emphasis circular controls.
- `src/components/port-picker/PortPicker.vue:1-102` keeps connection controls compact and utility-like rather than turning them into a large standalone session panel.

Important implications:

- connection controls live in the primary chrome, not in a separate left-rail workflow
- header status is icon-led and hardware-led
- the connect affordance is visually louder than most other controls

### Left rail

Betaflight's left rail is not a sidebar dashboard. It is a tab list.

- `src/index.html:130-256` shows the rail as a plain vertical task list under the header
- `src/css/main.less:712-764` styles tabs as compact pill rows with icon + label
- `src/css/main.less:766-839` defines the icon mask system, which is a major part of recognition speed

Important implications:

- the rail is primarily for navigation, not information
- active state is a simple pill highlight, not a card
- each row is recognizable by icon before text

### Content canvas

Betaflight's content area is mostly light neutral surfaces inside darker chrome.

- `src/css/theme.css:25-35` sets `surface-100/200/300` to light grays by default
- `src/css/main.less:259-289` and `src/css/main.less:696-716` show `#main-wrapper`, `#content`, and `.tab_container` sitting on those light surfaces
- `src/css/theme.css:67-80` makes dark theme optional, not the baseline assumption

Important implications:

- "very close to Betaflight" means the default content impression should be light-neutral, not full dark
- the shell can still be darker than the content
- our current all-dark branch is fundamentally off-model

## 2. Betaflight Visual Grammar

### Typography

Betaflight uses small utilitarian typography with one large tab title.

- `src/css/main.less:15-24` sets the body to `Open Sans` at `12px`
- `src/css/main.less:971-976` gives `.tab_title` a `2rem`, low-weight heading with amber underline

Important implications:

- the main page title is large and plain
- everything else is compact and practical
- our current IBM Plex/data-heavy styling still reads more technical and custom than Betaflight

### Boxes and notes

Betaflight repeats a small set of primitives everywhere.

- `src/css/main.less:993-1000` defines the amber guidance note
- `src/css/main.less:1013-1118` defines the content wrapper and fixed bottom toolbar
- `src/css/main.less:1192-1237` defines `.gui_box` and `.gui_box_titlebar`

Important implications:

- most screens are built from the same `note + gui_box + save toolbar` kit
- the title bar pill anchored on top of each box is part of the brand shape
- our current branch still invents new card patterns instead of reusing a Betaflight-like box system

### Actions

Betaflight reserves bright green for the main connect action and amber for the general accent family.

- `src/css/theme.css:7-18` defines the amber accent range
- `src/css/theme.css:62-64` defines green as `primary-action`
- `src/css/main.less:1049-1093` and `src/css/main.less:1116-1127` show how save/apply bars use that system

Important implications:

- we should keep amber for focus/selection
- save/apply/connect should read green
- not every primary action should use the same style

## 3. Setup Tab Anatomy

Betaflight `Setup` is a bench tool, not an overview page.

- `src/components/tabs/SetupTab.vue:6-90` puts calibrate buttons first, with short explanatory copy to the right
- `src/components/tabs/SetupTab.vue:92-116` puts the model in the middle and attaches `Reset Z axis` directly to it
- `src/components/tabs/SetupTab.vue:118-343` stacks narrow info boxes on the right for instruments, GPS, info, sensors, and features
- `src/components/tabs/SetupTab.vue:1206-1271` styles the model block as a bordered paper surface, not a dramatic HUD
- `src/css/main.less:61-76` defines the graph-paper background used behind the model

Important implications:

- Setup should be action rows + model + utility boxes
- the 3D model needs a paper-like stage, not a cinematic instrument card
- bench heading reset should stay adjacent to the model
- the side column should be made of small titled boxes, not broad summary cards

### Why our current Setup still diverges

Current branch references:

- `apps/web/src/App.tsx:6689-6890`
- `apps/web/src/styles.css:1421-1582`

Current branch still differs because:

- the top section is a custom list of large action cards, not Betaflight's button-left / explanation-right rows
- the center area still uses our own custom viewer framing instead of a paper-backed model block
- the side stack is still composed as custom cards with product-specific copy rather than small reusable utility boxes
- the page still introduces guided setup as a major identity element, while Betaflight's Setup is intentionally narrower

## 4. Ports Tab Anatomy

Betaflight `Ports` is a dense table-first editor.

- `src/components/tabs/PortsTab.vue:17-139` renders a real table with columns for `Configuration`, `Serial RX`, `Telemetry`, `Sensors`, and `Peripherals`
- `src/css/tabs/ports.less:1-58` styles that table with alternating neutral rows and minimal chrome
- `src/components/tabs/PortsTab.vue:135-139` uses a fixed bottom save bar

Important implications:

- the recognisable shape is the table itself, not just "one row per port"
- Betaflight users expect grouped role columns, not a generic "function" cell
- save/apply is fixed at the bottom, outside the main grid

### Why our current Ports still diverges

Current branch references:

- `apps/web/src/App.tsx:7475-8194`
- `apps/web/src/styles.css:1315-1356`
- `apps/web/src/styles.css:4012-4129`

Current branch still differs because:

- it is still a custom matrix, not a Betaflight-like table
- it still treats the row as a composite card with multiple stacked subpanels
- it still uses custom row status framing rather than simple alternating table rows
- it still exposes one generalized function editor instead of Betaflight-like grouped role columns

### Betaflight-like implementation implication for ArduPilot

We do not need to copy Betaflight's exact semantics to copy its interaction model.

For ArduPilot, `Ports` should likely become:

1. `Port` identifier column
2. `Configuration / Console` column
3. `Receiver` column
4. `Telemetry` column
5. `Sensors` column
6. `Peripherals` column
7. inline baud / options affordance where needed

The UI can map those grouped selections back to `SERIALn_PROTOCOL`, `SERIALn_BAUD`, `SERIALn_OPTIONS`, and `BRD_SERx_RTSCTS` under the hood.

That is much closer to the Betaflight mental model than the current generic matrix.

## 5. VTX Tab Anatomy

Betaflight `VTX` is built from note blocks and utility boxes.

- `src/components/tabs/VtxTab.vue:3-27` starts with title + wiki + support notes
- `src/components/tabs/VtxTab.vue:29-165` uses a large configuration box
- `src/components/tabs/VtxTab.vue:168-226` uses a smaller actual-state box beside it
- `src/components/tabs/VtxTab.vue:229-260` begins a lower VTX table box
- `src/components/tabs/VtxTab.vue:470-470` uses the standard bottom fixed toolbar

Important implications:

- VTX should not look like a generic form page
- it should be a three-part utility layout
- the support-state notes are part of the expected visual language

## 6. OSD Tab Anatomy

Betaflight `OSD` is the strongest example of task-shaped UI in the product.

- `src/components/tabs/OsdTab.vue:3-26` opens with title, wiki, and support notes
- `src/components/tabs/OsdTab.vue:31-156` puts the element inventory and profile toggles in the left column
- `src/components/tabs/OsdTab.vue:158-259` puts the live draggable preview in the center
- `src/components/tabs/OsdTab.vue:261-340` begins the right-side settings stack
- `src/components/tabs/OsdTab.vue:613-613` uses the fixed bottom toolbar

Important implications:

- our eventual OSD redesign cannot just be "settings in a dedicated tab"
- it needs the left inventory / center canvas / right settings anatomy if the goal is recognisable Betaflight parity

## 7. Why The Current Branch Still Feels Different

The branch still diverges from Betaflight in five specific ways:

1. The entire app is dark-first instead of dark chrome plus light work surfaces.
2. The header is text-summary-driven instead of hardware-control-driven.
3. The left rail is still a sidebar with product framing instead of a simple icon tab list.
4. Setup and Ports are still rendered with our own card language instead of Betaflight's repeated `note + box + toolbar` pattern.
5. The editable tabs are not yet reusing a shared Betaflight-like box and save-bar system.

## 8. Non-Negotiable Design Directives

If we want this branch to satisfy JH's request, these are the non-negotiables:

1. Switch the main content surfaces to Betaflight-like light neutrals by default.
2. Rebuild the header so the connection affordance, port picker, and hardware state dominate it.
3. Rebuild the left rail as a compact icon-first task list with minimal extra framing.
4. Introduce a reusable Betaflight-like `gui_box` system for tab internals.
5. Rebuild `Setup` using Betaflight's action rows + model stage + utility boxes template.
6. Rebuild `Ports` as a true table with grouped role columns, not a custom matrix card.
7. Rebuild `VTX` and `OSD` using Betaflight's actual page anatomy, not just their names.
8. Use fixed bottom save/apply bars consistently on editable tabs.

## 9. Immediate Next Implementation Order

The next implementation order should be:

1. shell rebuild toward Betaflight chrome and light content canvas
2. shared `gui_box`, note, tab title, and bottom-toolbar primitives
3. Setup rebuild against that shared kit
4. Ports rebuild as grouped role table
5. VTX rebuild as `config + state + table`
6. OSD rebuild as `elements + preview + settings`

Until those are done, the branch may have closer tab names and some denser layouts, but it will still not read as "very close to Betaflight configuration."
