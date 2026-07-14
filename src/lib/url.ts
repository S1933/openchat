const URL_RE = /\bhttps?:\/\/[^\s<>")']+/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE);
  if (!matches) return [];
  return matches
    .map((u) => u.replace(/[.,;:!?)]+$/g, ""))
    .slice(0, 1); // first URL only (YAGNI)
}
