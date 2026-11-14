/** The idea typed into the story's final input travels into the creation flow. */
let pending = '';
export function setPendingIdea(v: string) { pending = v; }
export function takePendingIdea() { const v = pending; pending = ''; return v; }
