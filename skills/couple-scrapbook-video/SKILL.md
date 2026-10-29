---
name: couple-scrapbook-video
description: Extend Little Days' Remotion recap compositions, preview controls, or MP4 export pipeline while preserving deterministic rendering from saved scrapbook pages.
---

# Little Days recap video

Read `packages/video/Recap.tsx`, `packages/video/index.tsx`, `apps/api/src/render-engine.ts`, `apps/api/src/render.ts` and `apps/api/src/jobs.ts`. The Player preview is independent from the external `apps/worker/src/main.ts` process.

Use snapshot data, a fixed referenceDate, and frame-based animations. Never use Date.now(), random values, or a live album fetch to determine per-frame output. Canvas state, interactive Motion animations, and browser session cookies are not the video source of truth.

Video is 1080 × 1920 at 30 fps with 15/30/60-second presets. Two seconds are reserved for the opener and three for the ending. Partition the remaining integer frames without gaps or overlap; preserve the user's selected page order. A page is fitted as a complete design, not destructively cropped into portrait.

`PageArtwork` provides shared layout. Uploaded image dimensions and `imageCrop()` must match the editor. Load both Latin and Vietnamese font subsets. `<Img>` and Remotion media components ensure render readiness. Every visual animation choice in the editor must have an actual video implementation.

Worker assetData contains local staged image bytes as data URIs, so render does not depend on a signed URL or browser cookie expiring. Only resolve assets already authorized by the snapshot. Audio supports the original procedural track, none, or private normalized MP3/WAV/M4A uploads with trim/loop/volume/fade. The job retains immutable audio metadata and stages bytes through MediaStore. Do not add arbitrary external media fetches. Waveform peaks are derived from mono PCM at 8 kHz, not fabricated from filenames or clip duration.

Remotion's webpack bundle needs extensionAlias to resolve explicit .js imports to TypeScript sources in this ESM repository. Keep all Remotion packages pinned to the same version. Preserve sequential progress writes so late callbacks cannot turn a completed task back into rendering.

Render in a work directory scoped to job ID and lease token. Publish under `exports/<job-id>/<lease-token>.mp4`, then conditionally commit outputKey while the lease remains valid. A canceled or stale worker can clean only its own unpublished artifact. Check the stored outputKey before cleanup when the completion result is ambiguous. Heartbeats continue during preparation and upload; losing DB access aborts work and leaves recovery to lease expiry.

Use `MediaStore` to load authorized assets and publish MP4; a worker on a separate machine cannot read API-local uploads. `npm run test:workers` starts an API, two external workers, and a signed S3 HTTP fixture and downloads an actual MP4, without a running dev server.

Test through `npm run test:render` with a stable API server; do not edit imported backend/domain files mid-test because watch mode restarts the queue. Check the downloaded MP4 with ffprobe and inspect at least an intro, page, and ending frame when changing timing or layout. A successful job record alone does not prove usable video output.
