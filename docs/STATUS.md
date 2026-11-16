# AETHER — Stage 03 status

Updated 17 November 2026. Branch `stage-03-backend`; production is untouched.

## Fully working (real data, tested)

- Sign up, email verification, sign in, sign out, session persistence, password change, protected routes
- Personal workspace on sign-up; more workspaces; switching; renaming
- Roles (owner, admin, editor, viewer) enforced by the API; invitations by single-use link; role changes; removing members; ownership transfer
- Idea first, account second: visitors explore an idea and choose a direction, then sign up; the project is created from what they chose
- Projects in Postgres: create, edit, delete, duplicate, search, filter, status and stage; board, list and timeline from real data; saves are debounced and conflict-safe
- Design, Motion and Space settings saved per project; comments; activity feed
- Versions: every meaningful change is a version; history panel; restore that never discards the current state
- Muse: stored conversation, structured proposals validated on the server, accept / reject / accept all / reject all, accepted changes become versions; usage, cost estimate, rate limits and daily budget
- Assets: real uploads with progress, type / size / content checks, private storage, previews, search, link to projects, delete
- Launch: server-side checks, exact-page preview, publish to a public address with verification, publishing history, rollback, unpublish
- Audit log for sensitive actions

## Working, but dependent on outside credentials or infrastructure

| Capability | State on staging | What is needed |
| --- | --- | --- |
| Muse with a real model | Blocked by the provider, so staging runs the labelled development fallback for now (`MUSE_PROVIDER=fallback` on Preview). The gateway accepted the deployment's identity but answered: "AI Gateway requires a valid credit card on file to service requests". The real-model path is covered by tests with a stand-in provider but has not yet answered a live request | In Vercel → AI Gateway, add a card to unlock the free monthly credit (or set another provider's key). Then delete `MUSE_PROVIDER` from the Preview variables, redeploy, and open `/api/muse/selftest`, which should say `"ok": true` |
| Email delivery (confirmation, password reset, invitations) | Not delivered. Confirmation links are shown on the staging confirm screen, labelled; invitation links are shown to the admin; password reset cannot complete | A Resend API key and a verified sending domain |
| Google sign-in | Hidden | A Google OAuth client id and secret |
| `name.aether.site` addresses | Not available; adapter refuses and lists what is missing | A registered domain, wildcard DNS, the wildcard domain on the hosting project, and one routing rule |

## Not built in this stage

- Billing, subscriptions, payments (out of scope by instruction)
- Real-time presence and live co-editing (changes from teammates appear when the tab regains focus)
- Editing the workspace brand kit (the page shows the system; projects carry their own design settings)
- Server-side thumbnails and malware scanning of uploads (previews are made in the browser; uploads are restricted by type, size and content signature, and never served inline unless they are images)
- 3D model preview for uploaded GLB files (stored and downloadable)
- Row Level Security (the browser never connects to the database; access is enforced in the API)
- Published pages are a static rendering of the project's hero (headline, copy, call to action, motion intro); they do not include the interactive 3D Core
