const ANKI_CONNECT = 'http://127.0.0.1:8765';

export async function invoke(action, params = {}) {
  const res = await fetch(ANKI_CONNECT, { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
  const { result, error } = await res.json();
  if (error) throw new Error(`anki: ${error}`);
  return result;
}

// Returns 'added' or 'duplicate'.
export async function addWord(deck, word, back) {
  await invoke('createDeck', { deck });
  try {
    await invoke('addNote', {
      note: {
        deckName: deck,
        modelName: 'Basic',
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

export const sync = () => invoke('sync');
