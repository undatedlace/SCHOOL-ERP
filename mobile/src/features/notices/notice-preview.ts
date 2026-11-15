/**
 * A short plain-text preview of a notice's message for the list: whitespace collapsed to single
 * spaces, cut at a word boundary, with an ellipsis when something was left out.
 */
export function previewOf(body: string | null | undefined, max = 110): string {
  const text = (body ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // Cut at a word unless that would throw away most of the preview.
  const clean = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${clean.replace(/[\s,;:.-]+$/, '')}…`;
}
