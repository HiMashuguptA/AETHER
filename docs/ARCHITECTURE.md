# AETHER — Stage 03 architecture

Status: built on the `stage-03-backend` branch and deployed to staging (Vercel preview). Production (`main`) still serves the approved Stage 02 frontend and is not connected to any of this.

## 1. Shape

A modular monolith. One repository, one deployment:

```
Browser (approved Stage 02 React app, unchanged look and motion)
   │  same origin, httpOnly session cookie
   ▼
Vercel
 ├─ static frontend (Vite build, CDN)
 └─ one Vercel Function: the AETHER API (Hono)        api/index.ts → server/
      ├─ /api/auth/*      Better Auth (email + password, verification, reset, optional Google)
      ├─ /api/…           workspaces, projects, versions, Muse, assets, publishing
      └─ /p/<address>     published pages (public, static HTML)
          │               │                 │
          ▼               ▼                 ▼
     Postgres         Vercel AI Gateway   Vercel Blob (private store)
     (Neon)           (any model)         uploaded files
```

Why this and not something bigger: the product needs transactions (accepting a proposal, versioning, publishing), strict per-workspace access rules and a handful of integrations. One API process with clear modules does that with the least to run and pay for. Nothing here needs queues, microservices or a separate backend host yet.

## 2. Technology choices

| Need | Chosen | Why | Considered and not chosen |
| --- | --- | --- | --- |
| API | Hono on a single Vercel Function (Node) | Tiny, typed, standard `Request`/`Response`; runs the same in tests and locally (`server/dev.ts`); deploys with the frontend so preview deployments are full staging environments | Separate server (Render/Fly): another host, another bill, CORS. Supabase Edge Functions: fine, but see database row |
| Database | Postgres on Neon | Plain Postgres over a normal connection string, so nothing in the code is Neon specific. The account's Neon plan is Free and allows many projects, so staging and production can be separate databases at no cost | Supabase: a good fit technically (Postgres + auth + storage + RLS), but the account's two free Supabase projects are already used by other work, so AETHER would have needed a paid plan. Vercel Postgres is Neon underneath |
| Auth | Better Auth (library, runs inside the API, tables in our database) | Sign up, email verification, password reset, sessions, rate limits and Google OAuth without a separate auth vendor or per-user pricing; user ids are ordinary foreign keys | Clerk: polished but a second vendor holding the user table, priced per active user. Supabase Auth: tied to the Supabase decision. Hand-rolled: not worth the risk |
| Authorization | Checks in the API, in one place (`server/lib/access.ts`) | The browser never talks to the database; every route calls `requireMember` / `requireProject` with a minimum role. Not a member → 404, so ids cannot be probed | Row Level Security: the right tool when browsers query the database directly (Supabase). Here only the API connects, so RLS would duplicate the checks; it can be added later as defence in depth |
| AI | Provider-independent Muse service; default provider Vercel AI Gateway | One OpenAI-compatible endpoint for many models; on Vercel it authenticates with the function's own short-lived token, so there is no API key to store or leak; model is an environment variable | Calling one vendor directly: also supported (`openai`, `anthropic` adapters), just set the provider and key |
| Files | Vercel Blob, private store, behind a storage interface | Direct browser-to-storage uploads with short-lived, single-path tokens issued by the API after checks; nothing public | S3/R2: equally possible via the same interface, needs more credentials |
| Email | Resend, behind an adapter | Simple API, free tier is enough for early use | SES/Postmark: same adapter shape |
| Publishing | Built-in adapter: immutable builds stored in Postgres and served at `/p/<address>` | Real, verifiable publishing with zero extra infrastructure | Per-project deployments or `*.aether.site`: needs a domain and wildcard DNS that do not exist yet (adapter written, refuses to run until configured) |
| Validation | Zod schemas shared by browser and API (`shared/model.ts`) | One definition of a valid project; model output is validated against it | — |

## 3. Database

Version-controlled SQL migrations in `db/migrations`, applied in order by `server/migrate.ts` (each in a transaction, recorded in `schema_migrations`). Nothing is created by hand.

| Area | Tables |
| --- | --- |
| Users | `user`, `session`, `account`, `verification`, `rateLimit` (Better Auth), `user_preferences` |
| Workspaces | `workspaces`, `workspace_members` (role: owner, admin, editor, viewer), `invitations` (hashed single-use tokens) |
| Projects | `projects` (design, motion and space configuration as validated JSON; `revision` for optimistic concurrency; soft delete), `project_versions` (full snapshots, numbered per project, kind: create / edit / muse / restore / publish / duplicate) |
| Design system | `design_systems` (tokens, palettes, typography, components per workspace) |
| Muse | `muse_conversations`, `muse_messages` (source: user / ai / fallback, model), `creative_directions` (idea, interpretation, the three directions, the one selected), `proposals` (change, status pending / accepted / rejected / stale, who decided, version it created), `ai_usage` (tokens, cost, latency, attempts, outcome) |
| Assets | `assets` (metadata, storage location, checksum, dimensions, status), `asset_projects` |
| Collaboration | `comments`, `activity_events`, `audit_log` |
| Launch | `publishes` (immutable artifact + hash, checks, step log, status), `sites` (address → live publish, room for a custom domain) |
| Operations | `api_rate_limits`, `dev_outbox` (staging only) |

Foreign keys cascade from workspace → projects → everything under a project. Indexes cover every list the UI shows (projects by workspace and recency, activity by workspace, versions by project, messages by conversation, and so on). Check constraints guard enumerations, lengths, slugs and ranges.

## 4. API

JSON over HTTPS, same origin, all under `/api`. Errors are always `{ error: { code, message, details? } }` with a message that is safe to show. Summary (full list: `server/routes`):

- `GET /api/health`, `GET /api/me`, `PATCH /api/me/preferences`
- Workspaces: create, rename, `GET /workspaces/:id/bootstrap` (everything the UI needs in one call), members, invitations, role changes, usage
- Projects: create, read, patch (with `baseRevision`), delete, duplicate, versions list / read / restore, comments
- Muse: `POST /muse/directions` (open to visitors, tightly limited), `GET|POST /projects/:id/muse`, `POST /projects/:id/proposals`, accept / reject one or all
- Assets: upload config, direct upload (local), Blob upload token + completion (staging/production), file, thumbnail, patch, delete
- Publishing: checks, preview, history, publish, unpublish, rollback; public `GET /p/:address`

The browser side is a typed client (`src/data/api.ts`) and two stores: `session.ts` (who you are, which workspace) and `store.ts` (workspace data and every mutation). The approved components call the same store functions as before; the functions now call the API.

## 5. Authentication flow

1. Sign up with name, email, password (10+ characters). The account is created unverified; a confirmation link is emailed.
2. Opening the link verifies the address, signs the person in and returns them to the app.
3. Sessions are httpOnly, Secure, SameSite=Lax cookies, valid 30 days, refreshed daily. Signing out or resetting the password revokes them.
4. Password reset: a single-use link valid for one hour; the response never reveals whether an address has an account.
5. Google sign-in appears only when Google credentials are configured.

**Idea first, account second.** `#start` and `POST /api/muse/directions` work without an account. When the visitor reaches "create", the idea, chosen direction and settings are kept in the browser, the account is created, and the project is created automatically as soon as the session exists, including after following the confirmation link.

## 6. Permissions

| | Viewer | Editor | Admin | Owner |
| --- | --- | --- | --- | --- |
| See projects, library, activity, history | ✓ | ✓ | ✓ | ✓ |
| Create and edit projects, comment, use Muse, accept / reject proposals, upload and delete assets, restore versions | | ✓ | ✓ | ✓ |
| Publish, unpublish, roll back, delete projects, invite and remove editors and viewers, rename workspace, see AI usage | | | ✓ | ✓ |
| Invite or change admins, transfer ownership | | | | ✓ |

Enforced in the API on every request. The UI hides or disables what a role cannot do, but that is a courtesy, not the control.

## 7. Muse

`server/services/muse` exposes two operations, `exploreIdea` and `proposeForProject`, over a `ModelProvider` interface (`gateway`, `openai`-compatible, `anthropic`). Changing provider or model is an environment variable.

- **Structured output.** The model must answer with JSON matching a schema. The answer is then validated field by field against the same Zod schema that guards saves; each proposed change must target an allowed field with an in-range value. Invalid proposals are dropped; a wholly invalid answer is retried once, then reported as a failure.
- **Context.** The request carries the project's current design, motion and 3D settings, its stage and brief, the creative direction it was created from, open comments, the selected context chips and the last eight conversation turns, each trimmed to a fixed length.
- **Approval rule.** Muse can only create rows in `proposals`. Applying one is a separate, authenticated request by an editor: inside one transaction the project row is locked, the change is re-validated against the latest state, the project is written, a `muse` version is recorded and the proposal is marked accepted with that version. Rejecting only marks it rejected.
- **Reliability and cost.** Timeout (25 s), one retry on transient errors, per-user and per-workspace rate limits, a daily spend cap for the workspace and for the whole environment, and a row in `ai_usage` for every call (tokens, estimated cost, latency, outcome). Admins see the totals on the Team page.
- **Honest fallback.** With no provider configured, a rule-based engine answers and every message, proposal and direction set is stored and shown as "Development fallback · not AI". A real provider that fails is reported as a failure; the fallback is never substituted silently.

## 8. Assets

Allowed: PNG, JPEG, WebP, AVIF, GIF (≤15 MB, GIF ≤10 MB), GLB (≤40 MB), Lottie JSON (≤5 MB), PDF (≤20 MB). SVG and HTML are never accepted.

Upload (staging/production): the browser asks the API for a path, the API checks role, type and size and issues a short-lived token valid for that one path and content type; the browser uploads straight to the private Blob store; the browser then calls `complete`, where the API reads the stored file, checks its size and its first bytes against the claimed type, and only then creates the `ready` asset row (otherwise deletes the file). Downloads and thumbnails go through `/api/assets/:id/file|thumb`, which checks workspace membership and sets `nosniff` and a download disposition for non-images.

## 9. Publishing

1. Launch page loads checks computed on the server from the saved project (contrast, motion length, call to action, title and description, and so on). A failing check blocks publishing; warnings do not.
2. Publish (admin): lock the project → record an immutable `publish` version → build a static, script-free HTML page from that snapshot → validate the build → store the artifact and its hash, point the address at it → read back what the public address serves and compare hashes → only then mark it `live`. Any failure marks the record `failed`, keeps the previous live build, and is shown with the step that failed.
3. Unpublish takes the address down (404). Rollback puts an earlier build back live without touching the working project.

Published pages are served with a strict Content-Security-Policy (`default-src 'none'`), all text escaped.

`*.aether.site`: the `subdomain` adapter exists but reports its missing requirements (a registered domain, wildcard DNS, the wildcard domain on the hosting project) and refuses to deploy until they are met.

## 10. Security

- Secrets only in server environment variables. The frontend reads no environment variables at all, so nothing can be bundled by accident; API responses are tested for leaked secrets.
- Cookie sessions with CSRF protection: every state-changing request must carry the app's own `Origin`; no cross-origin access is granted.
- All SQL is parameterised. All input is validated with Zod; unknown fields are rejected on project data.
- Workspace isolation by construction: every query for workspace data goes through a membership check; cross-workspace requests return 404.
- Rate limits (stored in Postgres so they hold across instances) on sign-in, sign-up, reset, Muse, saves, invitations, publishing and anonymous idea exploration.
- Uploads: allow-list, size limits, content signature check, private storage, no inline serving of non-images.
- XSS: React escapes by default; project text rejects angle brackets; published pages escape everything and allow no scripts.
- Errors never include internals; unexpected errors are logged server-side and answered generically.
- `audit_log` records sign-in-independent sensitive actions: workspace and member changes, project create / delete / restore, proposal decisions, publishing.
- Security headers on every response (`nosniff`, frame options, referrer policy, HSTS, permissions policy).

## 11. Environments and deployment

| | Local | Staging | Production |
| --- | --- | --- | --- |
| App | `npm run dev` + `npm run dev:api` | Vercel preview of `stage-03-backend` (protected by Vercel login) | Vercel production from `main` |
| Database | local Postgres | Neon project `aether-staging` | separate Neon project, created at cutover |
| Files | local disk | Blob store `aether-staging-assets` | separate store, created at cutover |
| Email | dev outbox | dev outbox for confirmation links only (no provider key yet) | Resend with a verified domain |
| Muse | fallback unless a key is set | AI Gateway | AI Gateway |

Vercel builds run `npm run build:deploy`: forward-only migrations for that environment's database, then the build. A failed migration fails the build and changes nothing. Environment variables are scoped per environment, so preview builds can never reach production data.

## 12. Cost

All figures are list prices from the providers' pricing pages in November 2026; check them before committing.

| Provider | Purpose | Free tier | Expected monthly cost now | Limits to know | When it starts to cost | Lock-in |
| --- | --- | --- | --- | --- | --- | --- |
| Vercel | Hosting, functions, CDN | Hobby plan | $0 | Hobby is for personal, non-commercial use; function and transfer allowances | Launching commercially needs Pro, $20 per member per month | Low: standard Vite build + a Hono app that runs on any Node host |
| Neon | Postgres | 100 projects, 1 GB storage and 100 compute-hours per project per month | $0 | Compute sleeps after 5 idle minutes (first request then takes about a second) | Beyond the free allowance: pay as you go, about $0.11 per compute-hour and $0.35 per GB-month | Low: plain Postgres, `pg_dump` out |
| Vercel AI Gateway | Muse | $5 of credit every 30 days on free-tier models | $0 within the credit | Free tier covers a subset of models with lower rate limits; buying credits ends the free credit | Pay as you go at provider list price, no markup. At the default model's price (about $0.10 / $0.50 per million tokens in / out) a Muse request costs roughly $0.0005 to $0.001 | Low: provider is a setting |
| Vercel Blob | Uploaded files | 1 GB storage included on Hobby | $0 | Shared Hobby allowances | About $0.023 per GB-month plus operations and transfer | Low: storage interface, files are plain objects |
| Resend | Email | 3,000 emails per month, 100 per day, one domain | $0 | Needs a domain you own to send to real users | $20 per month for 50,000 | Low: one adapter |
| Domain | `aether.site`-style addresses | — | not purchased | — | Roughly $10–40 per year depending on the name | — |

Realistic total: **$0 per month for staging and private testing**. A commercial launch is **about $20 per month** (Vercel Pro) plus usage, with AI spend capped by `MUSE_DAILY_BUDGET_USD`.

## 13. What is real, and what still needs something from outside

See `docs/STATUS.md`.
