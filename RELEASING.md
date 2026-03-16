# Releasing

This repository is not yet at a “click one button and publish binaries” stage. The current release process is source-first, with optional browser builds and desktop preview artifacts when they are explicitly validated.

## Current Release Shapes

- Source release from a tagged commit on `main`
- Browser build output from `apps/web`
- Optional desktop preview artifacts from the thin Electron shell

Desktop packaging is not fully automated yet. Treat packaged desktop builds as preview artifacts until a dedicated packaging workflow exists.

## Release Checklist

1. Ensure the branch is clean and based on the intended `main` tip.
2. Run:
   - `npm ci`
   - `npm run typecheck`
   - `npm run test`
   - `npm run test:e2e`
3. Run `npm run test:sitl` when the change touches runtime/write-path behavior.
4. Run a short live-FC pass for hardware-facing workflow changes.
5. Update public docs when contributor-facing or user-facing behavior changed:
   - `README.md`
   - `CONTRIBUTING.md`
   - `ARCHITECTURE.md`
   - `SUPPORT.md`
   - `SECURITY.md`
6. Confirm no private planning material or local-only artifacts are staged.
7. Write concise release notes that summarize:
   - the product/user-visible changes
   - validation performed
   - known gaps or risks

## Tagging

Use lightweight semantic versioning while the project is pre-1.0:

- `v0.x.y`

Patch releases should be safe regressions or packaging/doc updates. Minor releases can expand supported configuration coverage or major validated product workflows.

## Browser Build

Build the browser app with:

```bash
npm run build --workspace @arduconfig/web
```

The output is a static web bundle under `apps/web/dist`.

## Desktop Preview Builds

Build the desktop shell with:

```bash
npm run build:desktop
```

or build both browser and desktop together with:

```bash
npm run desktop:app
```

This produces the runnable Electron shell, but not a polished installer/package pipeline. If preview binaries are shared, note the exact commit SHA and validation performed.
