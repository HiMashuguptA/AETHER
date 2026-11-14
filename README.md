# ÆTHER — Stage 02 interactive frontend prototype

The scroll-driven story site and the creative workspace behind it, in one React app.
Frontend only: every project, asset, comment and Muse proposal is mocked in local state.
No backend, database, authentication, real AI, payments or deployment infrastructure.

**Live:** https://aether-delta-lime.vercel.app (Vercel, deploys automatically from `main`)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally
```

Node 20+ recommended. `dist/` uses relative paths (`base: './'`), so it can be served from any folder.

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
| `#start` | New project flow: spark → directions → setup → forming |
| `#workspace` | Dashboard |
| `#projects` | Board / list / timeline |
| `#project-<id>` | Creative space with Design, Motion and Space modes |
| `#launch-<id>` | Launch checks, preview and simulated publishing |
| `#library` | Asset library |
| `#activity`, `#brand-kit` | Activity feed, brand kit |

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
  data/
    store.ts             zustand store and every mutation (projects, assets, proposals, publish)
    muse.ts              mocked Muse: proposals, replies, directions
    seed.ts              seed people, projects, activity, assets
    types.ts             domain types
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

## What is mocked, and where real services plug in

| Area | Now | Integration point |
| --- | --- | --- |
| Data | Seeded zustand store, in memory | Replace actions in `data/store.ts` with API calls; types in `data/types.ts` are the contract |
| Muse | Keyword-based proposals and scripted streaming replies | `data/muse.ts` (`generateProposals`, `museReply`, `directionsFor`). Proposals always go through accept / reject; nothing auto-applies |
| Uploads | Object URLs with simulated progress | `addAsset` / `updateAsset` in the store |
| Publishing | Four timed steps, fake `<domain>.aether.site` URL | `startPublish` in the store |
| Sign-in | Nav button only, no auth | — |
| Email in setup | Format validation only | — |

### Headline refraction

The hero headline (and the intro lines under it) stays real DOM text: selectable, read by screen
readers, indexed. Where the drop overlaps it, a circular CSS mask hides those glyphs and the Core's
shader draws the same words bent by the drop's surface normals, using a texture painted from the
browser's own word positions. Mask and shader share one circle, so the hand-over is seamless. The
drop is placed from the measured end of the headline, so it crosses the last letters at any width.
Off in Still mode, with `prefers-contrast: more`, forced colours, or `?nolens`.

### Portrait tablets

Between 768 and 1100 px wide in portrait, the project canvas uses the full width with a resizable
panel sheet underneath (Properties, Layers, Comments, Muse, and Timeline in Motion mode). Muse rises
from the bottom so proposals stay previewed on the canvas above. Touch screens get larger targets,
and controls that would otherwise appear on hover stay visible.

## Security and privacy

- No API keys, tokens, credentials or environment variables are used or needed. `.env*` files are
  git-ignored in case integrations are added later; keep secrets in the hosting provider's settings.
- No analytics, cookies or third-party requests. Fonts, images and the 3D environment ship with
  the app. `localStorage` holds only the visitor's Motion tier choice and `sessionStorage` only a
  "preloader already seen" flag.
- All people, clients and projects in `src/data/seed.ts` are fictional.
- Third-party licences and attributions: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- No licence has been chosen for this repository yet, so default copyright applies.

## Known limits

- Frame rates were measured in software rendering during development; use `?perf` to check real devices.
- The Motion editor uses the Web Animations API, not GSAP (see the GSAP note in THIRD_PARTY_NOTICES.md).
