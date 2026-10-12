// Injected into the Google results page via chrome.scripting.executeScript, so it must not use anything outside its own body.
// preview: { partOfSpeech, definition } or null when the dictionary was unreachable.
// decks: deck names for the dropdown; selected: the one preselected (the last used).
export function showToast(word, preview, decks, selected) {
  const messages = deck => ({
    added: `Added to ${deck}`,
    duplicate: `Already in ${deck}`,
    queued: "Couldn't reach Anki or the dictionary. Queued, it will be added automatically",
    'not-found': 'No definition found, not added',
  });
  // Built with DOM calls, not innerHTML: Google enforces Trusted Types, and the word must never be parsed as HTML.
  const el = (tag, props = {}, ...children) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...children);
    return e;
  };

  document.getElementById('auto-anki-toast')?.remove();
  const host = el('div', { id: 'auto-anki-toast' });
  // Closed shadow root: Google's CSS and scripts can't restyle or reach into the card.
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :host { all: initial; }
    .card { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; width: 320px; max-width: calc(100vw - 32px);
      box-sizing: border-box; padding: 14px 16px; border-radius: 12px; font: 14px/1.45 system-ui, sans-serif;
      background: #fff; color: #1f1f1f; border: 1px solid #dadce0; box-shadow: 0 6px 24px rgba(0,0,0,.18); }
    .label { font-size: 12px; color: #5f6368; margin-bottom: 4px; }
    .word { font-size: 18px; font-weight: 600; }
    .def { margin-top: 6px; }
    .def:empty { display: none; }
    .actions { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
    button, select { font: inherit; cursor: pointer; border-radius: 8px; }
    select { flex: 1; min-width: 0; padding: 5px 8px; border: 1px solid #dadce0; background: #fff; color: inherit; }
    select:disabled { opacity: .6; cursor: default; }
    .add { padding: 6px 16px; border: 0; background: #235390; color: #fff; font-weight: 600; }
    .add:disabled { opacity: .6; cursor: default; }
    .close { position: absolute; top: 6px; right: 6px; width: 28px; height: 28px; border: 0; background: none; color: #5f6368; font-size: 18px; }
    button:focus-visible, select:focus-visible { outline: 2px solid #1a73e8; outline-offset: 2px; }
    .status { font-size: 13px; color: #5f6368; margin-top: 8px; }
    .status:empty { display: none; }
    @media (prefers-color-scheme: dark) {
      .card { background: #303134; color: #e8eaed; border-color: #5f6368; }
      .label, .close, .status { color: #bdc1c6; }
      .add { background: #8ab4f8; color: #202124; }
      select { background: #202124; border-color: #5f6368; }
    }
  `);
  root.adoptedStyleSheets = [sheet];

  const deckSelect = el('select', { ariaLabel: 'Deck' }, ...decks.map(d => el('option', { value: d, textContent: d, selected: d === selected })));
  const add = el('button', { className: 'add', textContent: 'Add' });
  const close = el('button', { className: 'close', textContent: '×', ariaLabel: 'Dismiss' });
  const status = el('span', { className: 'status', role: 'status' });
  root.append(el('div', { className: 'card', role: 'dialog', ariaLabel: 'Add to Anki' },
    close,
    el('div', { className: 'label', textContent: 'Add to Anki?' }),
    el('div', { className: 'word', textContent: word }),
    el('div', { className: 'def', textContent: preview ? `(${preview.partOfSpeech}) ${preview.definition}` : '' }),
    el('div', { className: 'actions' }, deckSelect, add),
    status,
  ));

  close.onclick = () => host.remove();
  add.onclick = async () => {
    const deck = deckSelect.value;
    add.disabled = deckSelect.disabled = true;
    status.textContent = 'Adding...';
    const result = await chrome.runtime.sendMessage({ type: 'auto-anki:add', word, deck }).catch(() => undefined);
    const message = messages(deck)[result];
    status.textContent = message ?? "Couldn't add. Hover the Auto Anki icon for details";
    if (message) setTimeout(() => host.remove(), 2500);
    else add.disabled = deckSelect.disabled = false;
  };
  document.documentElement.append(host);
}
