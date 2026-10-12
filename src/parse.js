// shortcut: google.com only, because host permissions can't wildcard the TLD; add domains to manifest.json and here to support more
const GOOGLE_HOST = /^(www\.)?google\.com$/;
const QUOTE = `["'“”‘’]`;
const WORD = `\\p{L}+(?:[-'’]\\p{L}+)*`;
// "<word or up to 3-word phrase> meaning", quotes optional
const QUERY = new RegExp(`^${QUOTE}?(${WORD}(?: ${WORD}){0,2})${QUOTE}? meaning$`, 'iu');

export function extractWord(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || !GOOGLE_HOST.test(u.hostname) || u.pathname !== '/search') return null;
  const q = (u.searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ');
  return q.match(QUERY)?.[1].toLowerCase() ?? null;
}
