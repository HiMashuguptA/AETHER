import { createHash } from 'node:crypto';
import { env } from '../env.js';
import type { Snapshot } from '../../shared/model.js';

// ---------- launch checks (computed from the real project, not canned) ----------
export interface Check { id: string; group: 'Performance' | 'Accessibility' | 'Search'; label: string; status: 'pass' | 'warn' | 'fail'; detail: string; fix?: unknown }

const THEME = { obsidian: { bg: '#000000', text: '#f2f2f3' }, graphite: { bg: '#181818', text: '#f2f2f3' }, mist: { bg: '#f2f2f3', text: '#0b0b0c' } } as const;

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

export function runChecks(s: Snapshot): Check[] {
  const theme = THEME[s.doc.theme];
  const hidden = s.doc.hidden ?? {};
  const out: Check[] = [];
  const settle = Math.max(...s.motion.map((t) => t.start + t.duration));
  const headline = s.motion.find((t) => t.id === 'headline');
  out.push({ id: 'lcp', group: 'Performance', label: 'Text paints first', status: 'pass', detail: 'The published page is static HTML and CSS with no scripts, so the hero text paints immediately.' });
  out.push({
    id: 'motion', group: 'Performance', label: 'Intro settles quickly',
    status: settle > 3.5 ? 'fail' : (headline?.duration ?? 0) > 1.2 || settle > 2.6 ? 'warn' : 'pass',
    detail: settle > 3.5 ? `The intro takes ${settle.toFixed(1)} s to finish. Keep it under 3.5 s.` : (headline?.duration ?? 0) > 1.2 ? `The headline takes ${headline!.duration.toFixed(1)} s to settle. Under 1.2 s feels more responsive.` : `The whole intro finishes in ${settle.toFixed(1)} s.`,
    fix: (headline?.duration ?? 0) > 1.2 ? { scope: 'motion', track: 'headline', key: 'duration', value: 0.9 } : undefined,
  });
  const subRatio = contrast(s.doc.subheadTone, theme.bg);
  out.push({
    id: 'contrast', group: 'Accessibility', label: 'Text contrast',
    status: hidden.subhead || subRatio >= 7 ? 'pass' : subRatio >= 4.5 ? 'warn' : 'fail',
    detail: hidden.subhead ? 'Headline text is high contrast on this theme.' : `The subheading is ${subRatio.toFixed(1)}:1 on ${s.doc.theme}. ${subRatio >= 7 ? 'Comfortable for small text.' : subRatio >= 4.5 ? 'It passes AA; 7:1 reads better on phones in sunlight.' : 'Below the 4.5:1 minimum.'}`,
    fix: subRatio < 7 && !hidden.subhead ? { scope: 'doc', key: 'subheadTone', value: s.doc.theme === 'mist' ? '#313131' : '#c4c5cb' } : undefined,
  });
  const ctaWords = s.doc.cta.trim().split(/\s+/).filter(Boolean).length;
  out.push({
    id: 'cta', group: 'Accessibility', label: 'Clear call to action',
    status: hidden.cta ? 'warn' : ctaWords === 0 ? 'fail' : ctaWords > 5 ? 'warn' : 'pass',
    detail: hidden.cta ? 'The call to action is hidden, so the page has no next step.' : ctaWords === 0 ? 'The call to action has no label.' : ctaWords > 5 ? 'The label is long. Two to four words work best.' : 'The label is short and reads as an action.',
  });
  out.push({ id: 'rm', group: 'Accessibility', label: 'Reduced motion alternative', status: 'pass', detail: 'The published page switches the intro off for people who ask for less motion.' });
  const title = s.doc.headline.replace(/\n/g, ' ').trim();
  out.push({
    id: 'meta', group: 'Search', label: 'Title and description',
    status: !title ? 'fail' : s.doc.subhead.trim().length < 50 || title.length > 70 ? 'warn' : 'pass',
    detail: !title ? 'The headline is empty, so the page has no title.' : title.length > 70 ? 'The headline is over 70 characters and will be cut off in search results.' : s.doc.subhead.trim().length < 50 ? 'The description comes from the subheading, which is short. Add a sentence.' : 'Generated from the headline and subheading.',
  });
  return out;
}

// ---------- build: an immutable, self-contained page from a version snapshot ----------
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const hexOk = (s: string, d: string) => (/^#[0-9a-fA-F]{6}$/.test(s) ? s : d);
const EASE: Record<string, string> = { 'aether-out': 'cubic-bezier(0.22,1,0.36,1)', 'aether-in-out': 'cubic-bezier(0.65,0,0.35,1)', 'aether-expo': 'cubic-bezier(0.16,1,0.3,1)', linear: 'linear' };
const num = (n: unknown, d: number) => (typeof n === 'number' && Number.isFinite(n) ? n : d);

export function buildSite(s: Snapshot, opts: { client: string; number: number }): { html: string; hash: string; bytes: number } {
  const d = s.doc;
  const theme = THEME[d.theme] ?? THEME.obsidian;
  const accent = hexOk(d.accent, '#8b70ec');
  const onAccent = contrast(accent, '#000000') > contrast(accent, '#ffffff') ? '#000000' : '#ffffff';
  const hidden = d.hidden ?? {};
  const anim = s.motion.map((t) => `.l-${t.id}{animation:in-${t.id} ${num(t.duration, 0.8)}s ${EASE[t.easing] ?? EASE['aether-out']} ${num(t.start, 0)}s both}@keyframes in-${t.id}{from{opacity:0;transform:translateY(${num(t.fromY, 0)}px);filter:blur(${num(t.fromBlur, 0)}px)}}`).join('');
  const rings = d.visual === 'orbit' ? '<i class="ring r1"></i><i class="ring r2"></i>' : d.visual === 'lattice' ? '<i class="grid"></i>' : '';
  const shape = d.visual === 'form' ? '42% 58% 55% 45% / 48% 42% 58% 52%' : d.visual === 'drop' ? '50% 50% 50% 50% / 58% 58% 42% 42%' : '50%';
  const title = esc(d.headline.replace(/\n/g, ' '));
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ${esc(opts.client || s.name)}</title>
<meta name="description" content="${esc(d.subhead.slice(0, 300))}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${esc(d.subhead.slice(0, 300))}">
<meta name="generator" content="AETHER build ${opts.number}">
<style>
*{box-sizing:border-box;margin:0}html,body{height:100%}
body{background:${theme.bg};color:${theme.text};font:16px/24px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.page{min-height:100svh;display:flex;flex-direction:column;padding:${num(d.spacing, 24)}px clamp(20px,5vw,72px);overflow:hidden;position:relative}
nav{display:flex;align-items:center;justify-content:space-between;gap:24px;font-size:14px}
nav b{font-weight:500}nav ul{display:flex;gap:24px;list-style:none;padding:0;opacity:.72}
.hero{flex:1;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);align-items:center;gap:clamp(24px,5vw,80px);${d.align === 'center' ? 'grid-template-columns:1fr;justify-items:center;text-align:center;' : ''}}
h1{font-weight:400;letter-spacing:-.02em;font-size:clamp(34px,${(num(d.headlineSize, 60) / 12.8).toFixed(2)}vw,${num(d.headlineSize, 60)}px);line-height:1.04;white-space:pre-line;text-wrap:balance}
.sub{margin-top:24px;max-width:34em;color:${hexOk(d.subheadTone, theme.text)};font-size:18px;line-height:28px}
.cta{display:inline-block;margin-top:32px;padding:14px 26px;border-radius:${num(d.radius, 16)}px;background:${accent};color:${onAccent};font-weight:500;text-decoration:none}
.proof{margin-top:28px;font:12px/16px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;opacity:.6}
.visual{position:relative;width:min(38vw,440px);aspect-ratio:1;justify-self:center}
.orb{position:absolute;inset:8%;border-radius:${shape};background:radial-gradient(circle at 32% 26%,#fff 0,#d9d9e2 9%,#5d5d6b 30%,#0c0c10 62%,#000 100%);box-shadow:inset -18px -26px 60px ${accent}cc,inset 14px 10px 40px #ffffff22,0 0 120px ${accent}55}
.ring{position:absolute;inset:0;border-radius:50%;border:2px solid ${accent}aa;transform:rotateX(72deg) rotateZ(18deg)}.r2{inset:-9%;border-color:#ffffff55;transform:rotateX(64deg) rotateZ(-28deg)}
.grid{position:absolute;inset:8%;border-radius:50%;background:repeating-linear-gradient(60deg,#fff3 0 2px,transparent 2px 22px),repeating-linear-gradient(-60deg,#fff3 0 2px,transparent 2px 22px);mix-blend-mode:screen}
footer{font-size:12px;opacity:.5;padding-top:16px}
@media(max-width:760px){.hero{grid-template-columns:1fr}.visual{order:-1;width:min(60vw,280px)}nav ul{display:none}}
${anim}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style></head>
<body><div class="page">
${hidden.nav ? '' : `<nav class="l-nav"><b>${esc(opts.client || s.name)}</b><ul>${d.nav.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></nav>`}
<main class="hero"><div>
${hidden.headline ? '' : `<h1 class="l-headline">${esc(d.headline)}</h1>`}
${hidden.subhead ? '' : `<p class="sub l-subhead">${esc(d.subhead)}</p>`}
${hidden.cta || !d.cta ? '' : `<a class="cta l-cta" href="#">${esc(d.cta)}</a>`}
${hidden.proof ? '' : `<p class="proof l-proof">${esc(d.proof)}</p>`}
</div>
${hidden.visual ? '' : `<div class="visual l-visual" role="img" aria-label="Abstract chrome form"><i class="orb"></i>${rings}</div>`}
</main>
<footer>Made with AETHER · build ${opts.number}</footer>
</div></body></html>`;
  return { html, hash: createHash('sha256').update(html).digest('hex'), bytes: Buffer.byteLength(html) };
}

/** Catch a bad build before it can go live. */
export function validateBuild(html: string): string | null {
  if (Buffer.byteLength(html) > 200_000) return 'The build is larger than 200 KB.';
  if (!html.startsWith('<!doctype html>') || !html.includes('</html>')) return 'The build is not a complete HTML document.';
  if (/<script|javascript:|<[^>]*\son[a-z]+\s*=/i.test(html)) return 'The build contains script, which published pages may not include.';
  return null;
}

// ---------- deployment adapters ----------
export interface DeployResult { ok: boolean; url?: string; error?: string }
export interface DeployAdapter {
  name: string;
  /** Things that must be configured before this adapter can deploy; empty means ready. */
  requirements(): string[];
  publicUrl(slug: string): string;
}

/** Built in: the build is stored with the publish record and served by this app at /p/<slug>. Needs nothing extra. */
const builtin: DeployAdapter = { name: 'builtin', requirements: () => [], publicUrl: (slug) => `${env.appUrl}/p/${slug}` };

/**
 * Subdomain hosting (<slug>.aether.site). Not operational: it needs a registered domain with a
 * wildcard DNS record pointed at the host and the domain added to the hosting project. Until those
 * exist this adapter refuses to deploy instead of pretending.
 */
const subdomain: DeployAdapter = {
  name: 'subdomain',
  requirements: () => {
    const missing: string[] = [];
    if (!process.env.PUBLISH_ROOT_DOMAIN) missing.push('PUBLISH_ROOT_DOMAIN (a domain you own, e.g. aether.site)');
    if (process.env.PUBLISH_WILDCARD_READY !== 'true') missing.push('a wildcard DNS record (*.domain) and the wildcard domain added to the hosting project, then PUBLISH_WILDCARD_READY=true');
    return missing;
  },
  publicUrl: (slug) => `https://${slug}.${process.env.PUBLISH_ROOT_DOMAIN}`,
};

export function getAdapter(): DeployAdapter { return env.publishAdapter === 'subdomain' ? subdomain : builtin; }
