// Wiktionary, because api.dictionaryapi.dev is unreachable from some networks.
const API = 'https://en.wiktionary.org/api/rest_v1/page/definition/';
const MAX_SENSES = 3;
const TIMEOUT_MS = 8000;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntity(match, name) {
  if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? match;
  const code = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : Number(name.slice(1));
  return Number.isInteger(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
}

// Wiktionary HTML -> plain text. Service workers have no DOMParser, and the text is escaped again when rendered.
export function toText(html = '') {
  return html
    .replace(/<(ol|ul|dl)[\s\S]*$/i, '') // nested sub-senses
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns { word, senses: [{ partOfSpeech, definition, example }] }, or null if Wiktionary has no English definition.
export async function lookup(word) {
  const res = await fetch(API + encodeURIComponent(word), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`dictionary: HTTP ${res.status}`);
  const { en = [] } = await res.json();
  const senses = en
    .filter(e => e.partOfSpeech !== 'Symbol') // ISO codes and the like
    .flatMap(e => (e.definitions ?? []).map(d => ({
      partOfSpeech: e.partOfSpeech.toLowerCase(),
      definition: toText(d.definition),
      example: toText(d.examples?.[0] ?? d.parsedExamples?.[0]?.example) || undefined,
    })))
    .filter(s => s.definition)
    .slice(0, MAX_SENSES);
  return senses.length ? { word, senses } : null;
}
