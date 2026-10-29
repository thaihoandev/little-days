---
name: couple-scrapbook-backend
description: Extend Little Days' NestJS album, session, media, sharing, or export APIs with ownership checks and durable updates. Use for this repository's backend and persistence work.
---

# Little Days backend

Implementation lives in `apps/api/src/`; contracts and validation live in `packages/domain/index.ts`. Read `README.md` and `IMPLEMENTATION_STATUS.md` to distinguish the local implementation from the long-term plan.

SQLite is the default repository; DATABASE_URL selects PostgreSQL. Both use the same record repository and compare-and-swap revision checks. Do not replace a conditional write with a read-then-unconditional-write. Extend both adapters when introducing SQL features.

Sessions are random HttpOnly cookie credentials; database session keys are hashed. Registration promotes a guest owner without moving their albums. Login changes the active library. Check ownership on album reads, saves, uploads, media downloads, job status, cancellation, and output downloads. Return not-found for resources owned by someone else. Sharing tokens grant read-only access and must be rechecked for each private asset request after revocation.

Validate untrusted requests at runtime. Read image contents with Sharp; filenames and MIME declarations are insufficient. Keep 20 MB and 40-megapixel limits, rotate from EXIF, strip metadata from derivatives, and generate object names on the server. A failed album write must not leave the newly uploaded file behind.

`JobRepository` owns the `render_jobs` SQL table. Snapshot payload is immutable; public job views omit snapshot, assetData, outputKey and all lease credentials. Use conditional methods for cancellation/progress/completion, not generic record puts. A partial unique index reserves one active job per owner atomically. Legacy record exports migrate once with a migration marker.

API and workers are separate processes. Claims, lease renewal and completion require token ownership and unexpired database time. Never reset running jobs on process startup. A stale worker cannot publish, cancel or remove another attempt's output. Multiple workers on one SQLite database are tested; cross-host deployment requires PostgreSQL and shared object storage. Do not claim the entire application is safe for arbitrary API replica counts without broader lifecycle/load tests.

Use `MediaStore` for uploaded images and output files. Local, S3 and Cloudinary modes expose the same private API URLs. Cloudinary uses authenticated images/video and backend-only short-lived download URLs, not public CDN links. Only work directories and bundled sample assets are local implementation details. Never fall back silently to local media in cloud mode. Storage migration is explicit, checksum-verified, source-preserving and defaults to a dry run.

`.env` is an ignored user-owned secret file. `setup:env` never overwrites it. Keep Cloudinary credentials backend-only and do not print values while checking configuration. The root `.env` supplies API/worker configuration and Vite's public ports; never inject the object returned by loadEnv into client code.

Render Free mail uses the Brevo HTTPS adapter (`MAIL_DRIVER=brevo`, `BREVO_API_KEY`, `MAIL_FROM`) on the API only. Resend HTTPS and SMTP/TLS remain supported. HTTP provider endpoints are fixed; do not add configurable credential destinations or follow redirects. Keep send timeouts bounded, errors sanitized and failed-send tokens revoked. Do not blindly retry an ambiguous send. `test:mail` explicitly preloads a loopback fetch fixture into test processes only; it never sends real email. Preserve Render Blueprint `MAIL_DRIVER` as `sync:false` so later syncs do not disable manually configured mail. See AUTH_EMAIL.md.

`AccountDeletion` fences deleted owners and runs durable, leased media cleanup. Register external media writes with `begin(owner, key)` before upload and release operations in `finally`; keep uploads bounded by an abort timeout shorter than the operation lifetime. Register legacy keys before deleting their metadata. API and worker must share storage identity. Do not remove tombstones or bypass pending-deletion/operation checks in backup. Old backups and unreferenced legacy storage objects require a separate retention process; see `ACCOUNT_DELETION.md`.

`ResourcePolicy` reserves exact bytes before media writes and admits export jobs/counters in the same transaction. Use `remove/forget` only after successful storage deletion so failed cleanup stays charged. Keep rolling export counters independent of job history; canceled/failed admitted jobs still count. Preserve counter backups and storage fingerprint checks. Cleanup protects history, active snapshots and owner operations. See `OPERATIONS.md` before changing retention. Free Render mode runs API only with external PostgreSQL/Cloudinary; the local cloud worker reads `.env.cloud`. Never fall back to SQLite or local media on ephemeral hosts.

Use `npm run test:api` for request validation, session/ownership, image processing, revision conflict, sharing revocation, and export lifecycle. It starts an isolated API on port 4311 with test data in `test-results/`. Do not run schema-breaking experiments against the user's `data/` directory.
