# AETHER — Stage 03 status

Updated 19 November 2026. Stage 03 is released: production (`main`) runs the full app on its own database and file store; staging is the preview of `stage-03-backend`.

## Fully working (real data, tested)

- Sign up, sign in, sign out, session persistence, password change, protected routes. Email confirmation is asked for only where an email can actually be sent (see below)
- Personal workspace on sign-up; more workspaces; switching; renaming
- Roles (owner, admin, editor, viewer) enforced by the API; invitations by single-use link; role changes; removing members; ownership transfer
- Idea first, account second: visitors explore an idea and choose a direction, then sign up; the project is created from what they chose
- An example project for empty workspaces, created as an ordinary project
- Projects in Postgres: create, edit, delete, duplicate, search, filter, status and stage; board, list and timeline from real data; saves are debounced and conflict-safe
- Presence: teammates who have a project open appear in its header, with what they are working in. When a teammate saves, other open tabs load the change (unless they hold unsaved edits of their own)
- Design, Motion and Space settings saved per project; comments; activity feed
- Versions: every meaningful change is a version; history panel; restore that never discards the current state
- Workspace brand kit: name, accent, palette, typeface and voice, editable by editors. Muse receives it with every request
- Muse: stored conversation, structured proposals validated on the server, accept / reject / accept all / reject all, accepted changes become versions; usage, cost estimate, rate limits and daily budget
- Assets: real uploads with progress, type / size / content checks, private storage, previews (including an interactive preview of uploaded `.glb` models), search, link to projects, delete
- Launch: server-side checks, exact-page preview, publish to a public address with verification, publishing history, rollback, unpublish
- Export a project (settings, every version, comments) as JSON from the project menu
- Delete your account: removes workspaces only you use, with their files; shared workspaces must be handed over first, and your work there stays, credited to a former member
- Daily cleanup job (Vercel Cron): expired sessions and links, old rate-limit and presence rows, projects deleted more than 30 days ago, unfinished uploads
- Share card, favicon, app icons, web manifest, robots.txt and sitemap; published pages carry share tags and an icon in the project's accent
- Audit log for sensitive actions

## Working, but waiting on one step from you

| Capability | Now | What unlocks it |
| --- | --- | --- |
| Muse with a real model | Labelled development fallback (rule based, never presented as AI) | A free API key from Groq or Google AI Studio, added in Vercel as `GROQ_API_KEY` or `GEMINI_API_KEY` for Production and Preview, then a redeploy. No card is needed for either free tier. See SETUP → AI provider |
| Email (confirmation, password reset, invitation emails) | Production: no email is sent, so sign-up does not ask for confirmation, invitations are shared as links, and password reset is unavailable (change it from Account while signed in). Staging: links are shown in the app, labelled | A Resend API key and a sending domain you own, verified in Resend. The verified domain in the connected Resend account belongs to a client business, so it was not used |
| Google sign-in | Hidden | A Google OAuth client id and secret |
| `name.aether.site` addresses | Not available; the adapter refuses and lists what is missing | A registered domain, wildcard DNS, the wildcard domain on the hosting project, and one routing rule |

## Not built

- Billing, subscriptions, payments (out of scope by instruction)
- Live co-editing of the same field at the same moment (presence and refresh-on-save are built; simultaneous edits are resolved by revision checks, never merged silently)
- Server-side thumbnails and malware scanning of uploads (previews are made in the browser; uploads are restricted by type, size and content signature, and never served inline unless they are images)
- Row Level Security (the browser never connects to the database; access is enforced in the API)
- Published pages are a static rendering of the project's hero (headline, copy, call to action, motion intro); they do not include the interactive 3D Core
