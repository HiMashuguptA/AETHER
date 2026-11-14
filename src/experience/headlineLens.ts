import * as THREE from 'three';

/**
 * The hero headline refracting through the Core (Stage 01, chapter 02).
 *
 * The headline (and the intro paragraph under it) stays real DOM text: crisp, selectable and read by screen readers. Where the
 * Core passes over it, a soft circular mask hides the DOM glyphs inside the drop and the Core's
 * shader draws the same words, bent by the drop's surface normals (magnified, with a little
 * dispersion). Outside the drop nothing changes. The mask and the shader use the same circle, so
 * the two hand over seamlessly.
 *
 * Turned off for Still mode (no canvas), `prefers-contrast: more`, forced colours and `?nolens`.
 */

interface Part {
  el: HTMLElement;
  /** brightness of this element's glyphs inside the drop (matches its text colour) */
  ink: number;
  mask: string;
}
interface Registered {
  parts: Part[];
  copy: HTMLElement | null;
}

let reg: Registered | null = null;
let ro: ResizeObserver | null = null;
let texture: THREE.CanvasTexture | null = null;
let canvas: HTMLCanvasElement | null = null;
let drawnW = 0;
let drawnH = 0;
let pad = 0;
let dirty = true;

/** Read by the performance overlay. */
export const lensStatus = { state: 'idle' as 'idle' | 'waiting' | 'active' | 'off', reason: '' };

export function lensAllowed(): { ok: boolean; reason: string } {
  if (typeof window === 'undefined') return { ok: false, reason: 'server' };
  if (new URLSearchParams(window.location.search).has('nolens')) return { ok: false, reason: '?nolens' };
  if (window.matchMedia?.('(prefers-contrast: more)').matches) return { ok: false, reason: 'High contrast preference' };
  if (window.matchMedia?.('(forced-colors: active)').matches) return { ok: false, reason: 'Forced colours' };
  return { ok: true, reason: '' };
}

/**
 * Register the hero copy. The headline comes first; any other text that can sit behind the drop
 * (the intro paragraph) follows with its own ink level, so everything behind the drop bends alike.
 */
export function registerHeadline(parts: { el: HTMLElement; ink: number }[], copy: HTMLElement | null) {
  reg = { parts: parts.map((p) => ({ ...p, mask: '' })), copy };
  dirty = true;
  ro = new ResizeObserver(() => { dirty = true; });
  parts.forEach((p) => ro!.observe(p.el));
  document.fonts?.ready.then(() => { dirty = true; }).catch(() => undefined);
  const onResize = () => { dirty = true; };
  window.addEventListener('resize', onResize);
  const mine = reg;
  return () => {
    clearMasks();
    ro?.disconnect();
    ro = null;
    window.removeEventListener('resize', onResize);
    if (reg === mine) reg = null;
    lensStatus.state = 'idle';
  };
}

function opacityOf(el: HTMLElement) {
  const inline = el.style.opacity;
  const v = inline !== '' ? parseFloat(inline) : parseFloat(getComputedStyle(el).opacity);
  return Number.isFinite(v) ? v : 1;
}

function clearMasks() {
  reg?.parts.forEach((p) => {
    if (p.mask === '') return;
    p.el.style.removeProperty('mask-image');
    p.el.style.removeProperty('-webkit-mask-image');
    p.mask = '';
  });
}

function setMask(p: Part, x: number, y: number, r: number, f: number) {
  const value = `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, transparent ${(r - f).toFixed(1)}px, #000 ${r.toFixed(1)}px)`;
  if (value === p.mask) return;
  p.el.style.setProperty('mask-image', value);
  p.el.style.setProperty('-webkit-mask-image', value);
  p.mask = value;
}

interface Box { left: number; top: number; right: number; bottom: number; width: number; height: number }

function unionRect(parts: Part[]): Box {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const p of parts) {
    const q = p.el.getBoundingClientRect();
    if (q.width < 1) continue;
    l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
  }
  if (!Number.isFinite(l)) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
}

/** Paint the words into a texture at exactly the positions the browser laid them out. */
function draw(parts: Part[], box: Box) {
  const headSize = parseFloat(getComputedStyle(parts[0].el).fontSize) || 60;
  pad = Math.ceil(headSize * 0.35);
  const k = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.max(2, Math.ceil((box.width + pad * 2) * k));
  const ph = Math.max(2, Math.ceil((box.height + pad * 2) * k));

  if (!canvas || canvas.width !== pw || canvas.height !== ph) {
    canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    texture?.dispose();
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx || !texture) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pw, ph);
  ctx.scale(k, k);
  const range = document.createRange();

  for (const part of parts) {
    const cs = getComputedStyle(part.el);
    const fontSize = parseFloat(cs.fontSize) || 16;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.fillStyle = `rgba(255,255,255,${part.ink})`;
    const c2 = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ('letterSpacing' in c2) c2.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const walker = document.createTreeWalker(part.el, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
      const text = node.data;
      const re = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const r = range.getClientRects()[0];
        if (!r || r.width < 1) continue;
        const mt = ctx.measureText(m[0]);
        const asc = mt.fontBoundingBoxAscent || fontSize * 0.92;
        const desc = mt.fontBoundingBoxDescent || fontSize * 0.24;
        const baseline = r.top - box.top + pad + r.height * (asc / (asc + desc));
        const x = r.left - box.left + pad;
        // stretch to the browser's own measured width so canvas and DOM glyphs line up exactly
        const sx = mt.width > 0 ? r.width / mt.width : 1;
        ctx.save();
        ctx.translate(x, baseline);
        ctx.scale(sx, 1);
        ctx.fillText(m[0], 0, 0);
        ctx.restore();
      }
      node = walker.nextNode() as Text | null;
    }
  }
  texture.needsUpdate = true;
  drawnW = box.width;
  drawnH = box.height;
  dirty = false;
}

/** Right edge of the last glyph on the longest line of an element, in CSS px. */
export function textRight(el: HTMLElement): number {
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let right = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    range.selectNodeContents(node);
    for (const r of Array.from(range.getClientRects())) right = Math.max(right, r.right);
    node = walker.nextNode() as Text | null;
  }
  return right;
}

export interface LensUniforms {
  uLensOn: { value: number };
  uLens: { value: THREE.Vector4 };
  uTextRect: { value: THREE.Vector4 };
  uText: { value: THREE.Texture | null };
  uTextAmt: { value: number };
}

const vC = new THREE.Vector3();
const vE = new THREE.Vector3();
const right = new THREE.Vector3();

function off(u: LensUniforms, state: typeof lensStatus.state, reason = '') {
  u.uLensOn.value = 0;
  clearMasks();
  lensStatus.state = state;
  lensStatus.reason = reason;
}

/**
 * Called every frame by the story Core. `center` and `radius` describe the drop's main sphere in
 * world space; `size` is the canvas size in CSS pixels and `dpr` the canvas pixel ratio.
 */
export function updateLens(
  u: LensUniforms,
  camera: THREE.Camera,
  center: THREE.Vector3,
  radius: number,
  size: { width: number; height: number },
  dpr: number,
  allowed: boolean,
) {
  if (!allowed) return off(u, 'off', lensAllowed().reason || 'Disabled');
  if (!reg) return off(u, 'idle', 'Hero not on screen');
  const { parts, copy } = reg;
  let opacity = copy ? opacityOf(copy) : 1;
  for (const p of parts) opacity = Math.min(opacity, opacityOf(p.el) * (copy ? opacityOf(copy) : 1));
  if (opacity < 0.01) return off(u, 'waiting', 'Headline hidden');

  const rect = unionRect(parts);
  if (rect.bottom < 0 || rect.top > size.height || rect.width < 2) return off(u, 'waiting', 'Headline off screen');
  if (dirty || Math.abs(rect.width - drawnW) > 0.5 || Math.abs(rect.height - drawnH) > 0.5) draw(parts, rect);
  if (!texture) return off(u, 'waiting', 'Preparing text');

  camera.updateMatrixWorld();
  vC.copy(center).project(camera);
  if (vC.z > 1 || vC.z < -1) return off(u, 'waiting', 'Core behind camera');
  right.setFromMatrixColumn(camera.matrixWorld, 0).normalize().multiplyScalar(radius);
  vE.copy(center).add(right).project(camera);
  const W = size.width;
  const H = size.height;
  const cx = (vC.x * 0.5 + 0.5) * W;
  const cy = (0.5 - vC.y * 0.5) * H;
  const ex = (vE.x * 0.5 + 0.5) * W;
  const ey = (0.5 - vE.y * 0.5) * H;
  // a circle safely inside the drop's silhouette, with a soft edge for the hand-over
  const R = Math.hypot(ex - cx, ey - cy) * 0.95;
  const F = R * 0.06;

  const nx = Math.min(Math.max(cx, rect.left), rect.right);
  const ny = Math.min(Math.max(cy, rect.top - pad), rect.bottom + pad);
  if (Math.hypot(cx - nx, cy - ny) > R) return off(u, 'waiting', 'Core not over the headline');

  for (const p of parts) {
    const q = p.el.getBoundingClientRect();
    setMask(p, cx - q.left, cy - q.top, R, F);
  }
  u.uLens.value.set(cx * dpr, (H - cy) * dpr, R * dpr, F * dpr);
  u.uTextRect.value.set((rect.left - pad) * dpr, (H - rect.bottom - pad) * dpr, (rect.width + pad * 2) * dpr, (rect.height + pad * 2) * dpr);
  u.uText.value = texture;
  u.uTextAmt.value = opacity * opacity; // the DOM copy also blurs as it fades; let the sharp copy go first
  u.uLensOn.value = 1;
  lensStatus.state = 'active';
  lensStatus.reason = '';
}

export function releaseLens(u?: LensUniforms) {
  if (u) u.uLensOn.value = 0;
  clearMasks();
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __lens: typeof lensStatus }).__lens = lensStatus;
