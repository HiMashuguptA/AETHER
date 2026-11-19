import { app } from '../server/app.js';

/**
 * One Vercel Function serves the whole API (/api/*) and published pages (/p/*).
 * vercel.json rewrites those paths here and passes the original path in __path; when the
 * platform already preserves the original URL this is a no-op.
 */
export default {
  fetch(request: Request) {
    const url = new URL(request.url);
    const original = url.searchParams.get('__path');
    if (original && (original.startsWith('/api/') || original.startsWith('/p/'))) {
      url.searchParams.delete('__path');
      url.pathname = original;
      return app.fetch(new Request(url, request));
    }
    return app.fetch(request);
  },
};
