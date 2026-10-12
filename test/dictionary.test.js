import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookup, toText } from '../src/dictionary.js';
import { stubFetch, json, EPHEMERAL } from './helpers.js';

const entry = (partOfSpeech, ...definitions) => ({ partOfSpeech, language: 'English', definitions });

// --- toText

test('toText strips tags and keeps the link text', () => {
  assert.equal(toText(EPHEMERAL.en[0].definitions[0].definition), 'Lasting for a short period of time.');
});

test('toText drops empty usage-label spans and collapses whitespace', () => {
  assert.equal(
    toText('<span class="usage-label-sense" about="#mwt6"></span>  To start to <a href="/wiki/get_to_know">get to know</a>\n people.'),
    'To start to get to know people.');
});

test('toText cuts nested sub-sense lists', () => {
  assert.equal(toText('To move <a>swiftly</a>.\n<ol><li>To move forward quickly.</li></ol>'), 'To move swiftly.');
  assert.equal(toText('Top.<ul><li>x</li></ul>'), 'Top.');
  assert.equal(toText('Top.<dl><dd>quote</dd></dl>'), 'Top.');
});

test('toText decodes named and numeric entities', () => {
  assert.equal(toText('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;&nbsp;f'), 'a & b <c> "d" \'e\' f');
  assert.equal(toText('caf&#233; &#x263A; &#X41;'), 'café ☺ A');
});

test('toText leaves unknown or invalid entities as they are', () => {
  assert.equal(toText('&bogus; &#abc; &#x110000;'), '&bogus; &#abc; &#x110000;');
});

test('toText returns an empty string for empty, missing or tag-only input', () => {
  assert.equal(toText(''), '');
  assert.equal(toText(undefined), '');
  assert.equal(toText('<span></span>  '), '');
});

// --- lookup

test('maps the English entries to plain-text senses', async () => {
  stubFetch();
  assert.deepEqual(await lookup('ephemeral'), {
    word: 'ephemeral',
    senses: [
      { partOfSpeech: 'adjective', definition: 'Lasting for a short period of time.', example: 'an ephemeral fad' },
      { partOfSpeech: 'noun', definition: 'Something which lasts for a short period of time.', example: undefined },
    ],
  });
});

test('falls back to parsedExamples when examples is missing', async () => {
  stubFetch({ dict: () => json({ en: [entry('Verb', { definition: 'To x.', parsedExamples: [{ example: 'I <b>x</b>.' }] })] }) });
  assert.equal((await lookup('x')).senses[0].example, 'I x.');
});

test('keeps at most 3 senses, in API order across parts of speech', async () => {
  const defs = n => Array.from({ length: n }, (_, i) => ({ definition: `d${i}` }));
  stubFetch({ dict: () => json({ en: [entry('Verb', ...defs(2)), entry('Noun', ...defs(5))] }) });
  const { senses } = await lookup('run');
  assert.deepEqual(senses.map(s => `${s.partOfSpeech}:${s.definition}`), ['verb:d0', 'verb:d1', 'noun:d0']);
});

test('skips Symbol entries and definitions that are empty after cleanup', async () => {
  stubFetch({ dict: () => json({ en: [
    entry('Symbol', { definition: 'ISO 639-2 code' }),
    entry('Verb', { definition: '<span></span>' }, { definition: 'To move swiftly.' }),
  ] }) });
  assert.deepEqual((await lookup('run')).senses, [{ partOfSpeech: 'verb', definition: 'To move swiftly.', example: undefined }]);
});

test('ignores other languages', async () => {
  stubFetch({ dict: () => json({ nl: [entry('Noun', { definition: 'Dutch' })], other: [entry('Noun', { definition: 'x' })] }) });
  assert.equal(await lookup('run'), null);
});

test('returns null when there is nothing usable', async () => {
  for (const body of [{ en: [] }, { en: [entry('Noun')] }, { en: [{ partOfSpeech: 'Noun' }] }, { en: [entry('Symbol', { definition: 'x' })] }]) {
    stubFetch({ dict: () => json(body) });
    assert.equal(await lookup('x'), null, JSON.stringify(body));
  }
});

test('returns null on 404 (unknown word)', async () => {
  stubFetch({ dict: () => json({ status: 404, type: 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found' }, 404) });
  assert.equal(await lookup('qwzxvk'), null);
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

// A hung request must not block the confirm card. node's mock timers don't drive AbortSignal.timeout, so check the wiring.
test('passes a live abort signal and rejects when it fires', async () => {
  let signal;
  stubFetch({ dict: (url, init) => {
    signal = init.signal;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError'))));
  } });
  const pending = lookup('ephemeral');
  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal.aborted, false);
  signal.dispatchEvent(new Event('abort'));
  await assert.rejects(pending, { name: 'TimeoutError' });
});

test('URL-encodes the word', async () => {
  const { dictUrls } = stubFetch();
  await lookup('break the ice');
  await lookup('café');
  await lookup('a/b?c');
  assert.deepEqual(dictUrls, [
    'https://en.wiktionary.org/api/rest_v1/page/definition/break%20the%20ice',
    'https://en.wiktionary.org/api/rest_v1/page/definition/caf%C3%A9',
    'https://en.wiktionary.org/api/rest_v1/page/definition/a%2Fb%3Fc',
  ]);
});
