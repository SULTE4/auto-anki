import { extractWord } from './parse.js';
import { lookup } from './dictionary.js';
import { renderBack } from './card.js';
import { addWord, deckNames, sync, AnkiError } from './anki.js';
import { showToast } from './toast.js';

export const DECK = 'Auto Anki';
const RECENT_MS = 10 * 60 * 1000;
// shortcut: in-memory, so it resets when the service worker sleeps; Anki's duplicate check still prevents double cards
const recent = new Map();

function badge(text, color, title) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setTitle({ title });
}

// Shows the "Add to Anki?" card in the tab. Returns 'asked' | 'not-found', or undefined when the URL is ignored.
export async function handleUrl(url, tabId) {
  const word = extractWord(url);
  if (!word || Date.now() - (recent.get(word) ?? -Infinity) < RECENT_MS) return;
  recent.set(word, Date.now());
  await flushPending();
  const [entry, ankiDecks, { deck = DECK }] = await Promise.all([
    // Dictionary down: still ask without a preview; the add retries the lookup and queues on failure.
    lookup(word).catch(() => undefined),
    // Anki closed: offer only the default and last-used decks.
    deckNames().catch(() => []),
    chrome.storage.local.get('deck'),
  ]);
  if (entry === null) {
    badge('?', '#f9a825', `No definition found: ${word}`);
    return 'not-found';
  }
  const preview = entry ? { partOfSpeech: entry.senses[0].partOfSpeech, definition: entry.senses[0].definition } : null;
  const decks = [...new Set([DECK, deck, ...ankiDecks])];
  await chrome.scripting.executeScript({ target: { tabId }, func: showToast, args: [word, preview, decks, deck] });
  return 'asked';
}

// The card's Add button. Returns the status for the card, or undefined for messages that aren't ours.
export function onMessage(msg) {
  const isText = v => typeof v === 'string' && v.trim() !== '';
  if (msg?.type !== 'auto-anki:add' || !isText(msg.word) || !isText(msg.deck)) return;
  const deck = msg.deck.trim();
  return chrome.storage.local.set({ deck }) // preselected on the next card
    .then(() => processWord(msg.word.trim().toLowerCase(), deck));
}

// Returns 'added' | 'duplicate' | 'not-found' | 'queued' | 'error'.
async function processWord(word, deck) {
  try {
    const entry = await lookup(word);
    if (!entry) {
      badge('?', '#f9a825', `No definition found: ${word}`);
      return 'not-found';
    }
    const status = await addWord(deck, word, renderBack(entry));
    if (status === 'added') {
      badge('+1', '#2e7d32', `Added to ${deck}: ${word}`);
      // Re-creating the alarm restarts it, so a burst of adds causes one sync.
      chrome.alarms.create('sync', { delayInMinutes: 1 });
    } else {
      badge('=', '#757575', `Already in ${deck}: ${word}`);
    }
    return status;
  } catch (e) {
    if (e instanceof AnkiError) {
      badge('!', '#c62828', `Anki error for "${word}": ${e.message}`);
      return 'error';
    }
    const { pending = [] } = await chrome.storage.local.get('pending');
    if (!pending.some(p => p.word === word && p.deck === deck)) await chrome.storage.local.set({ pending: [...pending, { word, deck }] });
    badge('!', '#c62828', `Queued "${word}" (${e.message}). Is Anki open?`);
    return 'queued';
  }
}

// Words that fail again are re-queued by processWord. A word retried twice is harmless: Anki rejects the duplicate.
export async function flushPending() {
  const { pending = [] } = await chrome.storage.local.get('pending');
  if (!pending.length) return;
  await chrome.storage.local.set({ pending: [] });
  // Entries queued before decks were selectable are plain words.
  for (const p of pending) await (typeof p === 'string' ? processWord(p, DECK) : processWord(p.word, p.deck));
}

export async function onAlarm({ name }) {
  if (name === 'sync') return sync().catch(e => console.warn('auto-anki sync failed:', e.message));
  if (name === 'flush') return flushPending();
}
