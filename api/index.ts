import { app } from '../server/app.js';

// One Vercel Function serves the whole API (/api/*) and published pages (/p/*); see vercel.json rewrites.
export default { fetch: (request: Request) => app.fetch(request) };
