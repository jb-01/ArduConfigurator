# Contributing

This project is trying to become a community-viable ArduPilot configurator, but it is not at the “accept anything anywhere” stage yet. Keep changes small, defensible, and aligned with the current product direction.

## Product Direction

Optimize for:

- setup and configuration first
- clear, task-focused UI
- verified writes and recoverability
- reusable shared runtime logic

Avoid:

- turning the app into a general-purpose GCS
- broad tuning expansion before metadata/configuration coverage improves
- raw-parameter-first UX for common tasks

## Local Setup

```bash
npm install
```

Useful commands:

```bash
npm run dev:web
npm run desktop:app
npm run typecheck
npm run test
npm run test:guided-setup
ARDUPILOT_REPO_PATH=/path/to/ardupilot npm run test:sitl
```

Desktop shell against a live web dev server:

```bash
npm run dev:web
npm run desktop:app:dev
```

## Validation Ladder

Use the lowest-risk validation path that can prove your change:

1. `npm run typecheck`
2. `npm run test`
3. `npm run test:sitl` for runtime/write-path changes
4. live FC validation for hardware-facing browser/runtime changes

Use the repo validation ladder directly: `typecheck`, `test`, `test:sitl` when relevant, then a short live-FC pass for hardware-facing changes.

For accelerometer-calibration changes specifically:

- cover both explicit completion-signal handling and the final-pose fallback path in runtime tests
- confirm live-FC behavior for first-pose advance and end-of-flow completion when that workflow is touched

## Live Hardware Safety

- Remove props before any motor/output test.
- Prefer reversible writes on unused or non-critical settings first.
- Capture a snapshot/backup before risky live changes.
- Avoid active-port or active-receiver changes unless that exact behavior is what you are testing.

## Code Expectations

- Keep shared logic in packages when it affects more than one surface.
- Prefer product-shaped surfaces over pushing users into raw `Parameters`.
- Preserve the separation between transport, MAVLink/session, runtime behavior, and UI.
- Add tests for transport/runtime logic when behavior changes.
- Keep README / CONTRIBUTING / ARCHITECTURE aligned when major contributor-facing workflow changes land.
- Keep third-party UI assets attributed and license-compatible when reusing reference visuals such as pose diagrams.

## Pull Requests

A good change should usually include:

- the code change
- tests or an explicit reason tests were not added
- documentation/status updates when user-facing behavior changed
- a concise explanation of what was validated

Use the issue and PR templates in `.github` unless there is a strong reason not to.

## License Note

The repository is licensed under `GPL-3.0-only`. Do not add third-party code or assets casually; keep provenance and licensing clear, and make sure new additions are compatible with the repository license.
