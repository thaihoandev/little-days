---
name: couple-scrapbook-editor
description: Extend Little Days' React scrapbook editor, templates, document history, or DOM viewer while preserving saved layout compatibility. Use for this repository's layout and editing features.
---

# Little Days editor

Read `packages/domain/index.ts` from the repository root for the authoritative Zod schemas, element factory, design dimensions, fonts, crop math, and date semantics. Do not infer fields from the planning document: it describes the larger target architecture.

Coordinates are in a fixed 720 × 900 design space. Zoom changes the canvas view, not saved coordinates. Rotation uses the top-left origin in both Konva and DOM. Normalize scale into width/height at transform end. Use `imageCrop()` in every renderer so source crop and target aspect ratio agree.

`apps/web/src/useDocument.ts` owns document history and saving. Commit one drag/transform as one edit. Group sequential changes to the same text or property, preserve server revision across undo, and retain current asset metadata. A flush must persist edits made while an earlier save was pending. When undo/redo returns to the saved document, report saved without requiring another mutation.

Autosave uses expectedRevision; a 409 blocks further writes until explicitly resolved. Keep the local draft and never silently overwrite the server. A user-scoped draft must not appear in another account. Separate selection/zoom/panel state from persisted content.

Keep `CanvasEditor.tsx`, `packages/scrapbook-renderer/index.tsx`, and `packages/video/Recap.tsx` aligned when changing visual primitives. Test Vietnamese IME input, wrapped text, image orientation/crop, and an actual video frame. New dynamic date elements resolve against album timezone on web and a fixed reference date in video.

Use bundled font files; a new font must support Vietnamese and load for both canvas and Remotion. Keep the editor's property controls usable without dragging. Retain reduced-motion behavior in the viewer.

Run `npm run typecheck`, relevant domain tests, and `npm run test:ui` against a stable local dev server for editing changes. Screenshots and test media go in ignored `test-results/`. The canvas module is lazy-loaded; preserve that split when editing the dashboard.
