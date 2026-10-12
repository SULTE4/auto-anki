const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const MAX_SENSES = 3;

// Returns { word, phonetic, senses: [{ partOfSpeech, definition, example }] }, or null if unknown.
export async function lookup(word) {
  const res = await fetch(API + encodeURIComponent(word));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`dictionary: HTTP ${res.status}`);
  const entries = await res.json();
  const senses = entries
    .flatMap(e => e.meanings ?? [])
    .flatMap(m => (m.definitions ?? []).map(d => ({ partOfSpeech: m.partOfSpeech, definition: d.definition, example: d.example })))
    .slice(0, MAX_SENSES);
  if (!senses.length) return null;
  const phonetic = entries.find(e => e.phonetic)?.phonetic
    ?? entries.flatMap(e => e.phonetics ?? []).find(p => p.text)?.text;
  return { word, phonetic, senses };
}
