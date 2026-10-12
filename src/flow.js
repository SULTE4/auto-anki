import { extractWord } from './parse.js';
import { lookup } from './dictionary.js';
import { renderBack } from './card.js';
import { addWord, sync } from './anki.js';

export const DECK = 'Auto Anki';
const RECENT_MS = 10 * 60 * 1000;
// shortcut: in-memory, so it resets when the service worker sleeps; Anki's duplicate check still prevents double cards
const recent = new Map();

function badge(text, color, title) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setTitle({ title });
}

// Returns 'added' | 'duplicate' | 'not-found' | 'queued', or undefined when the URL is ignored.
export async function handleUrl(url) {
  const word = extractWord(url);
  if (!word || Date.now() - (recent.get(word) ?? -Infinity) < RECENT_MS) return;
  recent.set(word, Date.now());
  await flushPending();
  return processWord(word);
}

async function processWord(word) {
  try {
    const entry = await lookup(word);
    if (!entry) {
      badge('?', '#f9a825', `No definition found: ${word}`);
      return 'not-found';
    }
    const status = await addWord(DECK, word, renderBack(entry));
    if (status === 'added') {
      badge('+1', '#2e7d32', `Added: ${word}`);
      // Re-creating the alarm restarts it, so a burst of adds causes one sync.
      chrome.alarms.create('sync', { delayInMinutes: 1 });
    } else {
      badge('=', '#757575', `Already in Anki: ${word}`);
    }
    return status;
  } catch (e) {
    const { pending = [] } = await chrome.storage.local.get('pending');
    if (!pending.includes(word)) await chrome.storage.local.set({ pending: [...pending, word] });
    badge('!', '#c62828', `Queued "${word}" (${e.message}). Is Anki open?`);
    return 'queued';
  }
}

// Words that fail again are re-queued by processWord. A word retried twice is harmless: Anki rejects the duplicate.
export async function flushPending() {
  const { pending = [] } = await chrome.storage.local.get('pending');
  if (!pending.length) return;
  await chrome.storage.local.set({ pending: [] });
  for (const word of pending) await processWord(word);
}

export async function onAlarm({ name }) {
  if (name === 'sync') return sync().catch(e => console.warn('auto-anki sync failed:', e.message));
  if (name === 'flush') return flushPending();
}
