# Third-party notices

ÆTHER is a fictional brand created for this prototype. This file lists the third-party software,
fonts and techniques the frontend uses, with their licences. Full licence texts ship inside each
package under `node_modules/` after `npm install`.

## Runtime libraries

| Package | Licence | Notes |
| --- | --- | --- |
| react, react-dom | MIT | |
| three | MIT | |
| @react-three/fiber, @react-three/drei, @react-three/postprocessing | MIT | |
| postprocessing | Zlib | |
| lenis | MIT | Smooth scrolling on the story site |
| zustand | MIT | Local state for the mocked workspace |
| @phosphor-icons/react | MIT | Icons |
| gsap | Standard "No Charge" GSAP License (Webflow) | Not open source. Free for commercial use, but the licence prohibits using GSAP in tools that let users build animations through a visual interface in a way that competes with Webflow. In this prototype GSAP drives only the marketing story site (`src/experience`, `src/lib/scroll.ts`). The workspace's Motion editor uses the browser's Web Animations API instead, and should stay GSAP-free if AETHER is ever built as a real product. Terms: https://gsap.com/standard-license |

## Fonts

| Font | Licence |
| --- | --- |
| Geist, Geist Mono (via @fontsource-variable) | SIL Open Font License 1.1 |

## Adapted components

- `src/components/reactbits/Magnet.tsx` and `SpotlightCard.tsx` are adapted from React Bits
  (https://reactbits.dev) by David Haz, MIT + Commons Clause License Condition v1.0. The Commons
  Clause allows use inside an application like this one but not selling the components themselves.
  Each file keeps its notice.

## Techniques

- The Core's signed distance functions (smooth minimum, torus, sphere blending) and the
  normal and ambient occlusion estimates follow techniques published by Inigo Quilez
  (https://iquilezles.org). They are written from scratch for this project.

## Images

- Everything in `src/assets/renders` is an original procedural render made for this project in
  Stage 01. No stock or third-party imagery is included.

## Build tools (not shipped to visitors)

vite (MIT), @vitejs/plugin-react (MIT), tailwindcss and @tailwindcss/vite (MIT), typescript (Apache-2.0).
