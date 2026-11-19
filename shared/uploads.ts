// Kept free of other imports so the browser can use it without pulling in the validation library.
/** Upload rules, enforced on the server and mirrored in the browser for early feedback. */
export const UPLOAD_RULES: Record<string, { kind: 'image' | '3d' | 'motion' | 'component'; maxMb: number }> = {
  'image/png': { kind: 'image', maxMb: 15 },
  'image/jpeg': { kind: 'image', maxMb: 15 },
  'image/webp': { kind: 'image', maxMb: 15 },
  'image/avif': { kind: 'image', maxMb: 15 },
  'image/gif': { kind: 'image', maxMb: 10 },
  'model/gltf-binary': { kind: '3d', maxMb: 40 },
  'application/json': { kind: 'motion', maxMb: 5 },
  'application/pdf': { kind: 'component', maxMb: 20 },
};
export const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif',
  glb: 'model/gltf-binary', json: 'application/json', pdf: 'application/pdf',
};
export function uploadRuleFor(name: string, mime: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const byExt = EXT_MIME[ext];
  // the extension decides; a declared type that disagrees with it is rejected (SVG and HTML are never accepted)
  if (!byExt) return null;
  if (mime && mime !== byExt && !(byExt === 'model/gltf-binary' && (mime === 'application/octet-stream' || mime === ''))) return null;
  return { mime: byExt, ...UPLOAD_RULES[byExt] };
}
