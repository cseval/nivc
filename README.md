# NIVC 2026 RPI Tracker

An internal Triple Crown Sports web application for 2026 NCAA Division I women's volleyball RPI estimates, source reconciliation, and NIVC outreach. The bundled migration reproduces the reference workbook for all 348 D1 programs and 1,946 completed matches.

## What is included

- Tracking dashboard with the complete 25-column workflow, filters, watchlist, mobile cards, inline outreach edits, and authenticated optimistic saves.
- Rankings with every RPI intermediate, adjustment, and a per-school D1 schedule drilldown.
- Match ledger, conference standings reconciliation, school-name aliases, source audit, methodology, and editable rule assumptions with live rank preview/history.
- A pure five-pass RPI engine that matches every workbook output and intermediate within `1e-12`.
- A staged nightly pipeline: fetch raw sources, parse stored payloads, reconcile/deduplicate, validate, compute, and publish.
- Verified email/password sign-in restricted to `@triplecrownsports.com`, secure server sessions, member/admin roles, server-validated outreach writes, and admin reruns.
- Daily Vercel cron at 06:00 UTC, 90-day run retention, and optional failed-run email through Resend.
- Server-paged tracking, ranking, and match views; on-demand schedule drilldowns; debounced server-side rule previews; and tagged five-minute Firestore caches with write-through invalidation.

Production fails closed when Firebase is unavailable. Bundled fixtures remain development/test inputs only and are never served as a production fallback.

## Run locally

Requirements: Node.js 24.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Useful checks:

```bash
npm run typecheck
npm test
npm run build
```

## Firebase setup

1. Create a Firebase project with Email/Password Authentication and Firestore.
2. Add `localhost` and each deployed Vercel hostname to Authentication's authorized domains, then copy `.env.example` to `.env.local`.
3. Fill the public web variables and Firebase Admin service-account variables.
4. Deploy `firestore.rules` with the Firebase CLI. Browser Firestore access is denied; the authenticated Next.js server owns all data access.
5. Seed the migrated workbook data:

```bash
npm run seed:firestore
```

New users must verify their `@triplecrownsports.com` address before the server creates a session, and they are created as `member`. Promote authorized staff by setting `users/{uid}.role` to `admin` in Firestore. Admins can maintain aliases and rules and trigger reruns; members can read the application and edit outreach fields.

## Authentication security

- Firebase handles registration, email verification, password reset, and password validation.
- The login endpoint accepts only a recently issued, verified Firebase ID token for the exact `triplecrownsports.com` domain.
- The server exchanges that token for a 12-hour `httpOnly`, `sameSite` session cookie.
- Protected pages verify the session before reading Firestore; mutation endpoints also require a same-origin CSRF token.
- Firestore Security Rules deny all browser reads and writes. Firebase Admin credentials must never use a `NEXT_PUBLIC_` prefix.
- Logged-out requests redirect to `/login` before protected page data is rendered.

## Vercel deployment and refresh pipeline

Production: [nivc-rpi-tracker.vercel.app](https://nivc-rpi-tracker.vercel.app)

The Vercel project is connected to `cseval/nivc`; every push to `main` creates a production deployment. Pull-request and non-production branch pushes create preview deployments.

Add all Firebase variables plus:

- `CRON_SECRET`: Vercel's cron bearer secret.
- `PIPELINE_SECRET`: a long random value used between the fetch, parse, and compute endpoints.
- `APP_BASE_URL`: the production HTTPS origin.
- `RESEND_API_KEY`, `ALERT_EMAIL_FROM`, and `ALERT_EMAIL_TO`: optional failed-refresh email configuration.

Secret environment files stay untracked, and `.vercelignore` excludes the workbook and local artifacts from deployments. `vercel.json` schedules `/api/cron/refresh` for 06:00 UTC daily. Each pipeline stage is separately dispatched so a large source refresh does not rely on one long serverless request. Raw responses and parsed staging collections remain under `runs/{runId}` for audit and debugging; completed runs older than 90 days are pruned.

Validation failures stop before publication, record the failed stage and error, preserve the current published dataset, and send an alert when email is configured.

## Performance architecture

Authentication and roles remain request-specific and are never shared-cached. Published Firestore collections are cached on the server for five minutes and invalidated immediately after outreach, alias, rule, or pipeline writes. Tracking, rankings, and matches send only the active page to the browser. Ranking schedules load when a school opens, and rule previews compute on the server after a short input debounce, so the browser never receives the full match ledger for those views.

## Refresh architecture

1. **Fetch:** download all 32 conference inputs plus supplemental schedules with a 45-second timeout and one retry; store immutable raw payloads.
2. **Parse:** parse only those stored payloads, normalize names, resolve the two contextual Miami aliases, corroborate ambiguous Loyola records, apply reviewed corrections, deduplicate reports, and classify match type.
3. **Compute:** run validation gates and the pure five-pass engine, then publish Firestore collections in safe 450-document batches. Outreach documents are created only for newly discovered schools, so staff-entered fields are retained.

Source or score conflicts are intentionally hard failures. Operators resolve the upstream alias/correction rather than silently choosing one report.

## Workbook migration

The original macro-enabled workbook and formula map are retained in `reference/`. To regenerate fixture JSON from that workbook:

```bash
npm run seed:extract -- reference/NIVC_2025-2026_RPI_Tracker_V2.xlsm fixtures/seed
```

The extractor uses the maintained SheetJS `0.20.3` distribution. The source workbook is read only; its macros are never executed.

## Key locations

- `lib/rpi/engine.ts` — deterministic RPI computation.
- `lib/pipeline/` — staged refresh, parsers, reconciliation, validation, and alerts.
- `firestore.rules` — deny-all browser data policy; authenticated server endpoints own reads and writes.
- `tests/engine-parity.test.ts` — full workbook parity test.
- `fixtures/seed/` — migrated preview/seed dataset.
- `reference/` — original handoff artifacts retained for audit.
