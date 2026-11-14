# ÆTHER — Stage 02 interactive frontend prototype

The scroll-driven story site and the creative workspace behind it, in one React app.
Frontend only: every project, asset, comment and Muse proposal is mocked in local state.
No backend, database, authentication, real AI, payments or deployment infrastructure.

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
| `?nocap` | Remove the frame-delta cap (only useful in automated tests on software renderers) |

The tier can also be changed from the **Motion** menu in the top navigation; that choice is kept in `localStorage`.

### Keyboard

- `Ctrl/⌘ K` command palette (workspace)
- `Ctrl/⌘ J` open or close Muse
- Any key, click or scroll skips the preloader

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

## Known limits

- Performance was measured only in software rendering (SwiftShader) during development. Real-GPU frame rates still need checking on the target devices.
- On tablet portrait the project canvas artboard is small; usable but not tuned.
- The Stage 01 "refraction through the Core" idea for the headline is not implemented; the headline stays crisp DOM text beside the Core.
