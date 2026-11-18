# ÆTHER

A cinematic story site and the creative workspace behind it, in one React app, now with a real backend:
accounts, workspaces and roles, projects and version history in Postgres, Muse (AI) proposals that
only apply when a person accepts them, private file uploads and real publishing.

| | |
| --- | --- |
| **Production** (`main`) | https://aether-delta-lime.vercel.app — the full app: story, accounts, workspaces, projects, Muse, uploads, publishing. |
| **Staging** (`stage-03-backend`) | https://aether-git-stage-03-backend-himanshus-projects-9c98f610.vercel.app — the same app on its own database and file store. Vercel sign-in required to open it. |
| Approved Stage 02 snapshot | branch `release/stage-02-approved` |

Documentation:
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — technology choices, database, API, auth, permissions, Muse, storage, publishing, security, costs
- [docs/SETUP.md](docs/SETUP.md) — local setup, environment variables, migrations, deployment, provider configuration, rollback, troubleshooting
- [docs/STATUS.md](docs/STATUS.md) — what works, what depends on outside credentials, what is not built
- [.env.example](.env.example) — every environment variable, explained

## Run it

```bash
npm install
createdb aether_dev
export DATABASE_URL=postgres://postgres@127.0.0.1:5432/aether_dev
export AUTH_SECRET=$(openssl rand -base64 48)
export DEV_OUTBOX=true
npm run db:migrate
npm run dev:api    # API on http://localhost:8787
npm run dev        # frontend on http://localhost:5173 (proxies /api and /p)

npm test           # API, permission, security, Muse, asset and publishing tests
npm run test:e2e   # Playwright: visitor → idea → sign-up → Muse → approval → versions → upload → publish
npm run build      # type-check + production build into dist/
```

Node 20+ and a local Postgres. Details in [docs/SETUP.md](docs/SETUP.md).

### URL flags

| Flag | Effect |
| --- | --- |
| `?tier=full` / `?tier=lite` / `?tier=still` | Force a quality tier (otherwise auto-detected) |
| `?perf` | Show the performance overlay on any build (see below). `?perf=0` hides it under `npm run dev` |
| `?nolens` | Turn off the headline refraction (the hero copy stays plain DOM text) |
| `?nocap` | Remove the frame-delta cap (only useful in automated tests on software renderers) |

The tier can also be changed from the **Motion** menu in the top navigation; that choice is kept in `localStorage`.

### Keyboard

- `Ctrl/⌘ K` command palette (workspace)
- `Ctrl/⌘ J` open or close Muse
- `Alt+Shift+P` hide or show the performance overlay (when it is enabled)
- Any key, click or scroll skips the preloader

### Performance overlay (development only)

On by default under `npm run dev`; in production builds it is off and its code is not downloaded
unless the URL has `?perf`. It shows:

- FPS from the page's own animation frames, average and worst frame time, a 30 s sparkline
- Active tier (Full / Lite / Still), whether it was chosen or automatic, and why
- Canvas pixel ratio, screen pixel ratio and the tier's cap
- Renderer status (rendering, paused when the story is hidden, still mode, context lost), canvas size, draw calls, GPU string
- Headline refraction status
- Events: start tier, automatic downgrades (Full → Lite, Lite pixel ratio capped at 1), Motion menu changes, WebGL context loss

Events are also written to the console as `[ÆTHER perf] …` while the overlay is enabled.

## Routes (hash based)

| Hash | Screen |
| --- | --- |
| *(none)* | Story site: Spark → Drop → Form → Lattice → Orbit → Universe |
| `#start` | New project flow: spark → directions → setup → forming. Open to visitors; the account comes after the idea |
| `#workspace` | Dashboard |
| `#projects` | Board / list / timeline |
| `#project-<id>` | Creative space with Design, Motion and Space modes |
| `#launch-<id>` | Launch checks, preview and simulated publishing |
| `#library` | Asset library |
| `#activity`, `#brand-kit` | Activity feed, brand kit |
| `#team`, `#account` | Members, roles and invitations; profile and password |
| `#signin`, `#signup`, `#forgot`, `#reset-password`, `#verified`, `#join`, `#check-email` | Authentication |
| `/p/<address>` | A published project (public) |

## Architecture

```
src/
  experience/            story site
    Story.tsx            preloader, nav, chapter rail, sections, one persistent canvas
    director.ts          shared chapter progress (0–1) written by ScrollTrigger
    headlineLens.ts      hero copy refracted through the drop (DOM mask + shader hand-over)
    useChapter.ts        binds a section's scroll range to a chapter value
    sections/            Hero, Tagline, Evolution, Showcase, Architecture, Platform, Portal, Launch
    scene/
      Stage.tsx          R3F canvas, post-processing (full tier), performance monitor
      choreography.ts    compose(chapters, aspect) → camera / Core / stack / particles targets
      Core.tsx           ray-marched liquid chrome Core (ShaderMaterial), drag, hover, ripple
      coreShader.ts      SDF morphs: sphere → drop → form → lattice → orbit (+ Muse split)
      Particles.tsx      GPU particles: awakening gather, ambient dust, galaxy
      Atmosphere.tsx     halo + light shafts
      GlassStack.tsx     five-layer architecture stack
      StudioEnvironment  procedural light rig (no external HDR files)
  app/                   workspace
    Workspace.tsx        shell, sidebar, mobile tabs, palette, Muse panel
    pages/               Dashboard, Projects, ProjectSpace, LaunchPage, Library, StartFlow, …
    components/          Artboard, MusePanel, CoreViewport, CommandPalette, Toaster
    auth/Auth.tsx        sign up, sign in, confirm email, reset password, join a workspace
  data/
    api.ts               typed client for the AETHER API
    session.ts           who is signed in, workspaces, roles, capabilities of this environment
    store.ts             workspace data and every mutation; each one calls the API
    muse.ts              rule-based engine, used only as the labelled development fallback
    seed.ts              fictional sample data used by the marketing story only
    types.ts             domain types
api/index.ts             the one Vercel Function (API + published pages)
server/                  Hono app: routes/, services/ (muse, publish, storage, email, projects), auth, db, migrate
shared/model.ts          project schemas and rules shared by browser and server
db/migrations/           version-controlled SQL migrations
tests/                   api.test.ts (Vitest) and e2e/ (Playwright)
  lib/
    quality.ts           Full / Lite / Still detection and overrides
    perf.ts              diagnostics event log and renderer facts (overlay in components/PerfOverlay.tsx)
    router.ts            hash router with View Transitions
    scroll.ts            Lenis + GSAP ticker wiring
  components/reactbits/  Magnet, SpotlightCard (adapted from React Bits; licence notice in file)
```

### Quality tiers

| Tier | When | What renders |
| --- | --- | --- |
| Full | Capable desktop GPU | DPR up to 1.75, 42k particles, 110 march steps, bloom + tone mapping |
| Lite | Touch devices, small screens, low memory or cores, or Full dropping frames | DPR up to 1.25, 9k particles, 64 steps, no post-processing |
| Still | Reduced motion, Save-Data, no WebGL2 | Stage 01 renders as stills, no canvas, no scroll-driven motion |

A running PerformanceMonitor downgrades Full → Lite, then caps Lite's DPR at 1.

## What is real

Everything in the workspace reads and writes through the API: accounts and sessions, workspaces and
roles, projects, versions, comments, activity, Muse conversations and proposals, assets, launch checks
and publishing. The marketing story still shows fictional sample projects by design.

Muse runs a clearly labelled development fallback until a free Groq or Gemini key is added (one
environment variable, no card). Email delivery, Google sign-in and custom publish domains also wait on
credentials; [docs/STATUS.md](docs/STATUS.md) lists exactly what each needs. Where something is not
available the app says so; it never pretends.

Also built: presence and refresh when a teammate saves, an editable brand kit that Muse follows,
interactive previews of uploaded `.glb` models, project export, account deletion, a daily cleanup job,
an example project, and share cards.

## Known limits

- Frame rates were measured in software rendering during development; use `?perf` to check real devices.
- The Motion editor uses the Web Animations API, not GSAP (see the GSAP note in THIRD_PARTY_NOTICES.md).
