import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleUrl, flushPending, onAlarm, DECK } from '../src/flow.js';
import { stubChrome, stubFetch, json, ankiDown } from './helpers.js';

const url = q => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const duplicate = action => (action === 'addNote'
  ? { result: null, error: 'cannot create note because it is a duplicate' }
  : { result: 1, error: null });

// The recent-word cache lives for the module's lifetime, so every test uses its own words.
let chrome;
beforeEach(() => { chrome = stubChrome(); });

test('adds a searched word to the deck, sets +1 and schedules a sync', async () => {
  const net = stubFetch();
  assert.equal(await handleUrl(url('ephemeral meaning')), 'added');
  assert.deepEqual(net.ankiActions(), ['createDeck', 'addNote']);
  const note = net.ankiRequests[1].body.params.note;
  assert.equal(note.deckName, DECK);
  assert.equal(note.fields.Front, 'ephemeral');
  assert.match(note.fields.Back, /Lasting for a short period of time\./);
  assert.deepEqual(chrome.calls.badge, ['+1']);
  assert.deepEqual(chrome.calls.title, ['Added: ephemeral']);
  assert.deepEqual(chrome.calls.alarms, [['sync', { delayInMinutes: 1 }]]);
});

test('ignores URLs that are not "<word> meaning" searches', async () => {
  const net = stubFetch();
  assert.equal(await handleUrl(url('weather today')), undefined);
  assert.equal(await handleUrl('https://www.google.com/maps?q=paris+meaning'), undefined);
  assert.deepEqual(net.dictUrls, []);
  assert.deepEqual(net.ankiRequests, []);
  assert.deepEqual(chrome.calls.badge, []);
});

test('skips the same word again within 10 minutes, then handles it after', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const net = stubFetch();
  assert.equal(await handleUrl(url('serendipity meaning')), 'added');
  assert.equal(await handleUrl(url('"Serendipity" meaning')), undefined);
  t.mock.timers.tick(10 * 60 * 1000 - 1);
  assert.equal(await handleUrl(url('serendipity meaning')), undefined);
  assert.equal(net.dictUrls.length, 1);
  t.mock.timers.tick(1);
  assert.equal(await handleUrl(url('serendipity meaning')), 'added');
  assert.equal(net.dictUrls.length, 2);
});

test('duplicate note sets = and does not schedule a sync', async () => {
  stubFetch({ anki: duplicate });
  assert.equal(await handleUrl(url('ubiquitous meaning')), 'duplicate');
  assert.deepEqual(chrome.calls.badge, ['=']);
  assert.deepEqual(chrome.calls.alarms, []);
});

test('unknown word sets ? and never calls Anki or queues', async () => {
  const net = stubFetch({ dict: () => json({}, 404) });
  assert.equal(await handleUrl(url('qwzxv meaning')), 'not-found');
  assert.deepEqual(net.ankiRequests, []);
  assert.deepEqual(chrome.calls.badge, ['?']);
  assert.deepEqual(chrome.calls.title, ['No definition found: qwzxv']);
  assert.equal(chrome.store.pending, undefined);
});

test('Anki down queues the word and sets !', async () => {
  stubFetch({ anki: ankiDown });
  assert.equal(await handleUrl(url('laconic meaning')), 'queued');
  assert.deepEqual(chrome.store.pending, ['laconic']);
  assert.deepEqual(chrome.calls.badge, ['!']);
  assert.match(chrome.calls.title[0], /^Queued "laconic" \(fetch failed\)/);
  assert.deepEqual(chrome.calls.alarms, []);
});

test('dictionary outage also queues the word instead of losing it', async () => {
  stubFetch({ dict: () => json({}, 503) });
  assert.equal(await handleUrl(url('pithy meaning')), 'queued');
  assert.deepEqual(chrome.store.pending, ['pithy']);
});

test('a word already in the queue is not queued twice', async () => {
  chrome.store.pending = ['terse'];
  stubFetch({ anki: ankiDown });
  await flushPending();
  assert.deepEqual(chrome.store.pending, ['terse']);
});

test('flushPending adds every queued word and empties the queue', async () => {
  chrome.store.pending = ['alpha', 'beta'];
  const net = stubFetch();
  await flushPending();
  assert.deepEqual(net.ankiRequests.filter(r => r.body.action === 'addNote').map(r => r.body.params.note.fields.Front), ['alpha', 'beta']);
  assert.deepEqual(chrome.store.pending, []);
  assert.deepEqual(chrome.calls.badge, ['+1', '+1']);
});

test('flushPending keeps the words that still fail', async () => {
  chrome.store.pending = ['gamma', 'delta'];
  stubFetch({ anki: (action, params) => (params.note?.fields.Front === 'delta' ? ankiDown() : { result: 1, error: null }) });
  await flushPending();
  assert.deepEqual(chrome.store.pending, ['delta']);
});

test('flushPending treats a queued word that is already in Anki as done', async () => {
  chrome.store.pending = ['epsilon'];
  stubFetch({ anki: duplicate });
  await flushPending();
  assert.deepEqual(chrome.store.pending, []);
});

test('flushPending does nothing on an empty or missing queue', async () => {
  const net = stubFetch();
  await flushPending();
  chrome.store.pending = [];
  await flushPending();
  assert.deepEqual(net.dictUrls, []);
  assert.deepEqual(chrome.calls.badge, []);
});

test('a new search first flushes the queue, then adds the new word', async () => {
  chrome.store.pending = ['zeta'];
  const net = stubFetch();
  assert.equal(await handleUrl(url('eta meaning')), 'added');
  assert.deepEqual(net.ankiRequests.filter(r => r.body.action === 'addNote').map(r => r.body.params.note.fields.Front), ['zeta', 'eta']);
  assert.deepEqual(chrome.store.pending, []);
});

test('several adds re-arm the same sync alarm, so Anki syncs once', async () => {
  const net = stubFetch();
  await handleUrl(url('theta meaning'));
  await handleUrl(url('iota meaning'));
  await handleUrl(url('kappa meaning'));
  assert.deepEqual(chrome.calls.alarms.map(([name]) => name), ['sync', 'sync', 'sync']);
  await onAlarm({ name: 'sync' });
  assert.equal(net.ankiActions().filter(a => a === 'sync').length, 1);
});

test('a failed sync alarm is logged, not thrown', async t => {
  stubFetch({ anki: ankiDown });
  const warn = t.mock.method(console, 'warn', () => {});
  await onAlarm({ name: 'sync' });
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[1], /fetch failed/);
});

test('the flush alarm flushes the queue', async () => {
  chrome.store.pending = ['lambda'];
  const net = stubFetch();
  await onAlarm({ name: 'flush' });
  assert.deepEqual(chrome.store.pending, []);
  assert.equal(net.ankiActions().filter(a => a === 'addNote').length, 1);
});

test('unknown alarms are ignored', async () => {
  const net = stubFetch();
  await onAlarm({ name: 'other' });
  assert.deepEqual(net.ankiRequests, []);
});
