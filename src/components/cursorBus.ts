/** Lightweight pub-sub so 3D objects and DOM elements can set the light cursor's context label. */
export type CursorVariant = 'ring' | 'press' | 'text' | 'hidden';
export interface CursorState { label?: string; variant: CursorVariant }

type Listener = (s: CursorState | null) => void;
const listeners = new Set<Listener>();
let current: CursorState | null = null;

export function setCursor(s: CursorState | null) {
  current = s;
  listeners.forEach((l) => l(s));
}
export function onCursor(l: Listener) {
  listeners.add(l);
  l(current);
  return () => { listeners.delete(l); };
}
