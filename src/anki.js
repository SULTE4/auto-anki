const ANKI_CONNECT = 'http://127.0.0.1:8765';
// Our own note type: the built-in "Basic" is renamed in localized Anki (e.g. "Простая" in Russian).
const MODEL = 'Auto Anki';

// Anki answered with an error. Unlike a network error, retrying the same request won't help.
export class AnkiError extends Error {}

export async function invoke(action, params = {}) {
  const res = await fetch(ANKI_CONNECT, { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
  const { result, error } = await res.json();
  if (error) throw new AnkiError(`anki: ${error}`);
  return result;
}

async function ensureModel() {
  if ((await invoke('modelNames')).includes(MODEL)) return;
  await invoke('createModel', {
    modelName: MODEL,
    inOrderFields: ['Front', 'Back'],
    css: '.card { font-family: system-ui, sans-serif; font-size: 20px; text-align: center; }\nol { text-align: left; }',
    cardTemplates: [{ Name: 'Card 1', Front: '{{Front}}', Back: '{{FrontSide}}<hr id=answer>{{Back}}' }],
  });
}

// Returns 'added' or 'duplicate'.
export async function addWord(deck, word, back) {
  await invoke('createDeck', { deck });
  await ensureModel();
  try {
    await invoke('addNote', {
      note: {
        deckName: deck,
        modelName: MODEL,
        fields: { Front: word, Back: back },
        tags: ['auto-anki'],
        options: { allowDuplicate: false, duplicateScope: 'deck' },
      },
    });
    return 'added';
  } catch (e) {
    if (/duplicate/i.test(e.message)) return 'duplicate';
    throw e;
  }
}

export const deckNames = () => invoke('deckNames');
export const sync = () => invoke('sync');
