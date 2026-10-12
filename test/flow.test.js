import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleUrl, onMessage, flushPending, onAlarm, DECK } from '../src/flow.js';
import { showToast } from '../src/toast.js';
import { stubChrome, stubFetch, json, ankiDown, ankiOk } from './helpers.js';

const url = q => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const add = (word, deck = DECK) => onMessage({ type: 'auto-anki:add', word, deck });
// Queue entries for the default deck.
const q = (...words) => words.map(word => ({ word, deck: DECK }));
const added = net => net.ankiRequests.filter(r => r.body.action === 'addNote').map(r => r.body.params.note.fields.Front);
const duplicate = ankiOk({ addNote: { result: null, error: 'cannot create note because it is a duplicate' } });

// The recent-word cache lives for the module's lifetime, so every test uses its own words.
let chrome;
beforeEach(() => { chrome = stubChrome(); });

// --- search: ask, never add on its own

test('a matching search shows the confirm card with a preview and adds nothing', async () => {
  const net = stubFetch();
  assert.equal(await handleUrl(url('ephemeral meaning'), 42), 'asked');
  assert.deepEqual(chrome.calls.scripts, [{
    target: { tabId: 42 },
    func: showToast,
    args: ['ephemeral', { partOfSpeech: 'adjective', definition: 'Lasting for a short period of time.' }, ['Auto Anki', 'Default', 'English vocab'], 'Auto Anki'],
  }]);
  assert.deepEqual(net.ankiActions(), ['deckNames']); // read-only: nothing is added before Add is clicked
  assert.deepEqual(chrome.calls.badge, []);
  assert.deepEqual(chrome.calls.alarms, []);
});

test('dictionary outage still asks, with no preview', async () => {
  stubFetch({ dict: () => json({}, 503) });
  assert.equal(await handleUrl(url('pithy meaning'), 7), 'asked');
  assert.deepEqual(chrome.calls.scripts[0].args.slice(0, 2), ['pithy', null]);
});

test('unknown word sets ? and does not ask', async () => {
  const net = stubFetch({ dict: () => json({}, 404) });
  assert.equal(await handleUrl(url('qwzxv meaning'), 1), 'not-found');
  assert.deepEqual(chrome.calls.scripts, []);
  assert.deepEqual(net.ankiActions(), ['deckNames']);
  assert.deepEqual(chrome.calls.badge, ['?']);
  assert.deepEqual(chrome.calls.title, ['No definition found: qwzxv']);
});

test('ignores URLs that are not "<word> meaning" searches', async () => {
  const net = stubFetch();
  assert.equal(await handleUrl(url('weather today'), 1), undefined);
  assert.equal(await handleUrl('https://www.google.com/maps?q=paris+meaning', 1), undefined);
  assert.deepEqual(net.dictUrls, []);
  assert.deepEqual(chrome.calls.scripts, []);
});

test('asks once for the same word within 10 minutes, then again after', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  stubFetch();
  assert.equal(await handleUrl(url('serendipity meaning'), 1), 'asked');
  assert.equal(await handleUrl(url('"Serendipity" meaning'), 1), undefined);
  t.mock.timers.tick(10 * 60 * 1000 - 1);
  assert.equal(await handleUrl(url('serendipity meaning'), 1), undefined);
  t.mock.timers.tick(1);
  assert.equal(await handleUrl(url('serendipity meaning'), 1), 'asked');
  assert.equal(chrome.calls.scripts.length, 2);
});

test('a failed injection rejects so the caller can log it', async () => {
  stubFetch();
  globalThis.chrome.scripting.executeScript = async () => { throw new Error('Cannot access contents of the page'); };
  await assert.rejects(handleUrl(url('nu meaning'), 1), /Cannot access/);
});

test('a new search first flushes the queue', async () => {
  chrome.store.pending = q('zeta');
  const net = stubFetch();
  assert.equal(await handleUrl(url('eta meaning'), 1), 'asked');
  assert.deepEqual(added(net), ['zeta']);
  assert.deepEqual(chrome.store.pending, []);
});

// --- Add button

test('Add adds the word to the deck, sets +1 and schedules a sync', async () => {
  const net = stubFetch();
  assert.equal(await add('ephemeral'), 'added');
  assert.deepEqual(net.ankiActions(), ['createDeck', 'modelNames', 'addNote']);
  const note = net.ankiRequests[2].body.params.note;
  assert.equal(note.deckName, DECK);
  assert.equal(note.fields.Front, 'ephemeral');
  assert.match(note.fields.Back, /Lasting for a short period of time\./);
  assert.deepEqual(chrome.calls.badge, ['+1']);
  assert.deepEqual(chrome.calls.title, ['Added to Auto Anki: ephemeral']);
  assert.deepEqual(chrome.calls.alarms, [['sync', { delayInMinutes: 1 }]]);
});

test('Add normalizes the word', async () => {
  const net = stubFetch();
  await add('  Ephemeral ');
  assert.deepEqual(added(net), ['ephemeral']);
});

test('Add on a word already in Anki returns duplicate, sets = and does not sync', async () => {
  stubFetch({ anki: duplicate });
  assert.equal(await add('ubiquitous'), 'duplicate');
  assert.deepEqual(chrome.calls.badge, ['=']);
  assert.deepEqual(chrome.calls.alarms, []);
});

test('Add on an unknown word returns not-found and never calls Anki', async () => {
  const net = stubFetch({ dict: () => json({}, 404) });
  assert.equal(await add('qwzxv'), 'not-found');
  assert.deepEqual(net.ankiRequests, []);
  assert.equal(chrome.store.pending, undefined);
});

test('Add with Anki down queues the word and sets !', async () => {
  stubFetch({ anki: ankiDown });
  assert.equal(await add('laconic'), 'queued');
  assert.deepEqual(chrome.store.pending, q('laconic'));
  assert.deepEqual(chrome.calls.badge, ['!']);
  assert.match(chrome.calls.title[0], /^Queued "laconic" \(fetch failed\)/);
  assert.deepEqual(chrome.calls.alarms, []);
});

test('Add with an Anki error reports it and does not queue (retrying would fail the same way)', async () => {
  stubFetch({ anki: ankiOk({ addNote: { result: null, error: 'model was not found: Auto Anki' } }) });
  assert.equal(await add('cogent'), 'error');
  assert.equal(chrome.store.pending, undefined);
  assert.deepEqual(chrome.calls.badge, ['!']);
  assert.deepEqual(chrome.calls.title, ['Anki error for "cogent": anki: model was not found: Auto Anki']);
  assert.deepEqual(chrome.calls.alarms, []);
});

test('flushPending drops a queued word that Anki rejects with an error', async () => {
  chrome.store.pending = q('mu', 'xi');
  const net = stubFetch({ anki: (action, params) => (params.note?.fields.Front === 'mu'
    ? { result: null, error: 'boom' } : ankiOk()(action)) });
  await flushPending();
  assert.deepEqual(chrome.store.pending, []);
  assert.deepEqual(added(net), ['mu', 'xi']);
  assert.deepEqual(chrome.calls.badge, ['!', '+1']);
});

test('Add with the dictionary down queues the word instead of losing it', async () => {
  stubFetch({ dict: () => json({}, 503) });
  assert.equal(await add('pithy'), 'queued');
  assert.deepEqual(chrome.store.pending, q('pithy'));
});

test('ignores messages that are not a valid add request', async () => {
  const net = stubFetch();
  for (const msg of [undefined, null, {}, { type: 'other', word: 'x', deck: 'd' }, { type: 'auto-anki:add' },
    { type: 'auto-anki:add', word: 42, deck: 'd' }, { type: 'auto-anki:add', word: '', deck: 'd' }, { type: 'auto-anki:add', word: '   ', deck: 'd' },
    { type: 'auto-anki:add', word: 'x' }, { type: 'auto-anki:add', word: 'x', deck: '' }, { type: 'auto-anki:add', word: 'x', deck: '  ' },
    { type: 'auto-anki:add', word: 'x', deck: ['d'] }]) {
    assert.equal(onMessage(msg), undefined, JSON.stringify(msg));
  }
  assert.deepEqual(net.dictUrls, []);
  assert.equal(chrome.store.deck, undefined);
});

// --- deck dropdown

test('preselects the last used deck', async () => {
  chrome.store.deck = 'English vocab';
  stubFetch();
  await handleUrl(url('omicron meaning'), 1);
  assert.deepEqual(chrome.calls.scripts[0].args.slice(2), [['Auto Anki', 'English vocab', 'Default'], 'English vocab']);
});

test('still offers the last used deck when Anki no longer has it', async () => {
  chrome.store.deck = 'Old deck';
  stubFetch();
  await handleUrl(url('pi meaning'), 1);
  assert.deepEqual(chrome.calls.scripts[0].args.slice(2), [['Auto Anki', 'Old deck', 'Default', 'English vocab'], 'Old deck']);
});

test('Anki closed: offers only the default and last used decks, and still asks', async () => {
  chrome.store.deck = 'English vocab';
  stubFetch({ anki: ankiDown });
  assert.equal(await handleUrl(url('rho meaning'), 1), 'asked');
  assert.deepEqual(chrome.calls.scripts[0].args.slice(2), [['Auto Anki', 'English vocab'], 'English vocab']);
});

test('Anki closed and no deck used yet: offers just the default deck', async () => {
  stubFetch({ anki: ankiDown });
  await handleUrl(url('sigma meaning'), 1);
  assert.deepEqual(chrome.calls.scripts[0].args.slice(2), [['Auto Anki'], 'Auto Anki']);
});

test('Add puts the card in the chosen deck and remembers it', async () => {
  const net = stubFetch();
  assert.equal(await add('tau', 'English vocab'), 'added');
  assert.deepEqual(net.ankiRequests[0].body.params, { deck: 'English vocab' });
  assert.equal(net.ankiRequests.find(r => r.body.action === 'addNote').body.params.note.deckName, 'English vocab');
  assert.equal(chrome.store.deck, 'English vocab');
  assert.deepEqual(chrome.calls.title, ['Added to English vocab: tau']);
});

test('Add trims the deck name and accepts subdecks', async () => {
  const net = stubFetch();
  await add('upsilon', '  English::Verbs ');
  assert.equal(net.ankiRequests.find(r => r.body.action === 'addNote').body.params.note.deckName, 'English::Verbs');
  assert.equal(chrome.store.deck, 'English::Verbs');
});

test('duplicate check is per deck: the badge names the deck', async () => {
  stubFetch({ anki: duplicate });
  assert.equal(await add('phi', 'Default'), 'duplicate');
  assert.deepEqual(chrome.calls.title, ['Already in Default: phi']);
});

test('a queued word keeps its deck and is added there later', async () => {
  stubFetch({ anki: ankiDown });
  assert.equal(await add('chi', 'English vocab'), 'queued');
  assert.deepEqual(chrome.store.pending, [{ word: 'chi', deck: 'English vocab' }]);
  const net = stubFetch();
  await flushPending();
  assert.equal(net.ankiRequests.find(r => r.body.action === 'addNote').body.params.note.deckName, 'English vocab');
  assert.deepEqual(chrome.store.pending, []);
});

test('the same word queued for two decks keeps both entries', async () => {
  stubFetch({ anki: ankiDown });
  await add('psi', 'Default');
  await add('psi', 'English vocab');
  await add('psi', 'Default');
  assert.deepEqual(chrome.store.pending, [{ word: 'psi', deck: 'Default' }, { word: 'psi', deck: 'English vocab' }]);
});

test('plain-word queue entries from before decks were selectable go to the default deck', async () => {
  chrome.store.pending = ['omega'];
  const net = stubFetch();
  await flushPending();
  assert.equal(net.ankiRequests.find(r => r.body.action === 'addNote').body.params.note.deckName, DECK);
  assert.deepEqual(chrome.store.pending, []);
});

// --- queue

test('a word already in the queue is not queued twice', async () => {
  chrome.store.pending = q('terse');
  stubFetch({ anki: ankiDown });
  await flushPending();
  assert.deepEqual(chrome.store.pending, q('terse'));
});

test('flushPending adds every queued word and empties the queue', async () => {
  chrome.store.pending = q('alpha', 'beta');
  const net = stubFetch();
  await flushPending();
  assert.deepEqual(added(net), ['alpha', 'beta']);
  assert.deepEqual(chrome.store.pending, []);
  assert.deepEqual(chrome.calls.badge, ['+1', '+1']);
});

test('flushPending keeps the words that still fail', async () => {
  chrome.store.pending = q('gamma', 'delta');
  stubFetch({ anki: (action, params) => (params.note?.fields.Front === 'delta' ? ankiDown() : ankiOk()(action)) });
  await flushPending();
  assert.deepEqual(chrome.store.pending, q('delta'));
});

test('flushPending treats a queued word that is already in Anki as done', async () => {
  chrome.store.pending = q('epsilon');
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

// --- alarms

test('several adds re-arm the same sync alarm, so Anki syncs once', async () => {
  const net = stubFetch();
  await add('theta');
  await add('iota');
  await add('kappa');
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
  chrome.store.pending = q('lambda');
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
