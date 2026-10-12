import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookup } from '../src/dictionary.js';
import { stubFetch, json, EPHEMERAL } from './helpers.js';

test('maps the API response to phonetic and senses', async () => {
  stubFetch();
  assert.deepEqual(await lookup('ephemeral'), {
    word: 'ephemeral',
    phonetic: '/əˈfɛm(ə)ɹəl/',
    senses: [
      { partOfSpeech: 'adjective', definition: 'Lasting for a short period of time.', example: 'an ephemeral fad' },
      { partOfSpeech: 'noun', definition: 'Something which lasts for a short period of time.', example: undefined },
    ],
  });
});

test('keeps at most 3 senses, in API order across entries and meanings', async () => {
  const defs = n => Array.from({ length: n }, (_, i) => ({ definition: `d${i}` }));
  stubFetch({ dict: () => json([
    { word: 'run', meanings: [{ partOfSpeech: 'verb', definitions: defs(2) }] },
    { word: 'run', meanings: [{ partOfSpeech: 'noun', definitions: defs(5) }] },
  ]) });
  const { senses } = await lookup('run');
  assert.deepEqual(senses.map(s => `${s.partOfSpeech}:${s.definition}`), ['verb:d0', 'verb:d1', 'noun:d0']);
});

test('falls back to phonetics[].text when phonetic is missing', async () => {
  stubFetch({ dict: () => json([{ ...EPHEMERAL[0], phonetic: undefined, phonetics: [{ audio: 'x.mp3' }, { text: '/fallback/' }] }]) });
  assert.equal((await lookup('ephemeral')).phonetic, '/fallback/');
});

test('phonetic is undefined when the API has none', async () => {
  stubFetch({ dict: () => json([{ ...EPHEMERAL[0], phonetic: undefined }]) });
  assert.equal((await lookup('ephemeral')).phonetic, undefined);
});

test('returns null on 404 (unknown word)', async () => {
  stubFetch({ dict: () => json({ title: 'No Definitions Found' }, 404) });
  assert.equal(await lookup('asdfgh'), null);
});

test('returns null when the entry has no definitions', async () => {
  stubFetch({ dict: () => json([{ word: 'x', meanings: [] }]) });
  assert.equal(await lookup('x'), null);
  stubFetch({ dict: () => json([{ word: 'x' }]) });
  assert.equal(await lookup('x'), null);
});

test('throws on server errors', async () => {
  stubFetch({ dict: () => json({}, 500) });
  await assert.rejects(lookup('ephemeral'), { message: 'dictionary: HTTP 500' });
  stubFetch({ dict: () => json({}, 429) });
  await assert.rejects(lookup('ephemeral'), { message: 'dictionary: HTTP 429' });
});

test('throws on network errors', async () => {
  stubFetch({ dict: () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(lookup('ephemeral'), TypeError);
});

test('URL-encodes the word', async () => {
  const { dictUrls } = stubFetch();
  await lookup('break the ice');
  await lookup('café');
  await lookup('a/b?c');
  assert.deepEqual(dictUrls, [
    'https://api.dictionaryapi.dev/api/v2/entries/en/break%20the%20ice',
    'https://api.dictionaryapi.dev/api/v2/entries/en/caf%C3%A9',
    'https://api.dictionaryapi.dev/api/v2/entries/en/a%2Fb%3Fc',
  ]);
});
