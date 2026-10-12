import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoke, addWord, deckNames, sync, AnkiError } from '../src/anki.js';
import { stubFetch, ankiDown, ankiOk } from './helpers.js';

const NOTE = {
  deckName: 'Auto Anki',
  modelName: 'Auto Anki',
  fields: { Front: 'ephemeral', Back: '<ol></ol>' },
  tags: ['auto-anki'],
  options: { allowDuplicate: false, duplicateScope: 'deck' },
};

test('invoke POSTs an AnkiConnect v6 request and returns the result', async () => {
  const { ankiRequests } = stubFetch({ anki: () => ({ result: 6, error: null }) });
  assert.equal(await invoke('version'), 6);
  assert.deepEqual(ankiRequests, [{ method: 'POST', body: { action: 'version', version: 6, params: {} } }]);
});

test('invoke throws an AnkiError with the AnkiConnect message', async () => {
  stubFetch({ anki: () => ({ result: null, error: 'collection is not available' }) });
  await assert.rejects(invoke('version'), e => e instanceof AnkiError && e.message === 'anki: collection is not available');
});

test('invoke throws a plain network error (not AnkiError) when Anki is not running', async () => {
  stubFetch({ anki: ankiDown });
  await assert.rejects(invoke('version'), e => e instanceof TypeError && !(e instanceof AnkiError));
});

test('addWord creates the deck and adds a note with our own note type', async () => {
  const { ankiRequests } = stubFetch();
  assert.equal(await addWord('Auto Anki', 'ephemeral', '<ol></ol>'), 'added');
  assert.deepEqual(ankiRequests.map(r => r.body), [
    { action: 'createDeck', version: 6, params: { deck: 'Auto Anki' } },
    { action: 'modelNames', version: 6, params: {} },
    { action: 'addNote', version: 6, params: { note: NOTE } },
  ]);
});

test('addWord creates the note type first when it is missing (e.g. localized Anki without "Basic")', async () => {
  const { ankiRequests, ankiActions } = stubFetch({ anki: ankiOk({ modelNames: { result: ['Простая', 'Задание с пропусками'], error: null } }) });
  assert.equal(await addWord('Auto Anki', 'ephemeral', '<ol></ol>'), 'added');
  assert.deepEqual(ankiActions(), ['createDeck', 'modelNames', 'createModel', 'addNote']);
  const model = ankiRequests[2].body.params;
  assert.equal(model.modelName, 'Auto Anki');
  assert.deepEqual(model.inOrderFields, ['Front', 'Back']);
  assert.deepEqual(model.cardTemplates, [{ Name: 'Card 1', Front: '{{Front}}', Back: '{{FrontSide}}<hr id=answer>{{Back}}' }]);
  assert.equal(typeof model.css, 'string');
  assert.deepEqual(ankiRequests[3].body.params, { note: NOTE });
});

test('addWord returns "duplicate" when the note already exists', async () => {
  stubFetch({ anki: ankiOk({ addNote: { result: null, error: 'cannot create note because it is a duplicate' } }) });
  assert.equal(await addWord('Auto Anki', 'ephemeral', 'x'), 'duplicate');
});

test('addWord rethrows other addNote errors', async () => {
  stubFetch({ anki: ankiOk({ addNote: { result: null, error: 'field Front is empty' } }) });
  await assert.rejects(addWord('Auto Anki', 'ephemeral', 'x'), { message: 'anki: field Front is empty' });
});

test('addWord stops when createModel fails', async () => {
  const { ankiActions } = stubFetch({ anki: ankiOk({
    modelNames: { result: [], error: null },
    createModel: { result: null, error: 'Model name already exists' },
  }) });
  await assert.rejects(addWord('Auto Anki', 'ephemeral', 'x'), AnkiError);
  assert.deepEqual(ankiActions(), ['createDeck', 'modelNames', 'createModel']);
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

test('deckNames returns the decks from Anki', async () => {
  const { ankiActions } = stubFetch({ anki: () => ({ result: ['Default', 'Английский'], error: null }) });
  assert.deepEqual(await deckNames(), ['Default', 'Английский']);
  assert.deepEqual(ankiActions(), ['deckNames']);
});

test('sync sends the sync action', async () => {
  const { ankiActions } = stubFetch();
  await sync();
  assert.deepEqual(ankiActions(), ['sync']);
});
