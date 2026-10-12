import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoke, addWord, sync } from '../src/anki.js';
import { stubFetch, ankiDown } from './helpers.js';

test('invoke POSTs an AnkiConnect v6 request and returns the result', async () => {
  const { ankiRequests } = stubFetch({ anki: () => ({ result: 6, error: null }) });
  assert.equal(await invoke('version'), 6);
  assert.deepEqual(ankiRequests, [{ method: 'POST', body: { action: 'version', version: 6, params: {} } }]);
});

test('invoke throws the AnkiConnect error message', async () => {
  stubFetch({ anki: () => ({ result: null, error: 'collection is not available' }) });
  await assert.rejects(invoke('version'), { message: 'anki: collection is not available' });
});

test('invoke throws when Anki is not running', async () => {
  stubFetch({ anki: ankiDown });
  await assert.rejects(invoke('version'), TypeError);
});

test('addWord creates the deck, then adds a Basic note without duplicates', async () => {
  const { ankiRequests } = stubFetch({ anki: () => ({ result: 1, error: null }) });
  assert.equal(await addWord('Auto Anki', 'ephemeral', '<ol></ol>'), 'added');
  assert.deepEqual(ankiRequests.map(r => r.body), [
    { action: 'createDeck', version: 6, params: { deck: 'Auto Anki' } },
    {
      action: 'addNote',
      version: 6,
      params: {
        note: {
          deckName: 'Auto Anki',
          modelName: 'Basic',
          fields: { Front: 'ephemeral', Back: '<ol></ol>' },
          tags: ['auto-anki'],
          options: { allowDuplicate: false, duplicateScope: 'deck' },
        },
      },
    },
  ]);
});

test('addWord returns "duplicate" when the note already exists', async () => {
  stubFetch({ anki: action => (action === 'addNote'
    ? { result: null, error: 'cannot create note because it is a duplicate' }
    : { result: 1, error: null }) });
  assert.equal(await addWord('Auto Anki', 'ephemeral', 'x'), 'duplicate');
});

test('addWord rethrows other addNote errors', async () => {
  stubFetch({ anki: action => (action === 'addNote'
    ? { result: null, error: 'model was not found: Basic' }
    : { result: 1, error: null }) });
  await assert.rejects(addWord('Auto Anki', 'ephemeral', 'x'), { message: 'anki: model was not found: Basic' });
});

test('addWord does not add the note when createDeck fails', async () => {
  const { ankiActions } = stubFetch({ anki: () => ({ result: null, error: 'boom' }) });
  await assert.rejects(addWord('Auto Anki', 'ephemeral', 'x'), { message: 'anki: boom' });
  assert.deepEqual(ankiActions(), ['createDeck']);
});

test('addWord throws when Anki is not running', async () => {
  stubFetch({ anki: ankiDown });
  await assert.rejects(addWord('Auto Anki', 'ephemeral', 'x'), TypeError);
});

test('sync sends the sync action', async () => {
  const { ankiActions } = stubFetch();
  await sync();
  assert.deepEqual(ankiActions(), ['sync']);
});
