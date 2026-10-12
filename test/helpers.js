// Stubs for what can't run under Node: the network and the chrome.* extension APIs.

export const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

// Trimmed real response from en.wiktionary.org/api/rest_v1/page/definition/ephemeral.
export const EPHEMERAL = {
  en: [
    {
      partOfSpeech: 'Adjective',
      language: 'English',
      definitions: [{
        definition: 'Lasting for a <a rel="mw:WikiLink" href="/wiki/short" title="short">short</a> period of <a rel="mw:WikiLink" href="/wiki/time" title="time">time</a>.',
        examples: ['an <b>ephemeral</b> fad'],
      }],
    },
    {
      partOfSpeech: 'Noun',
      language: 'English',
      definitions: [{ definition: 'Something which lasts for a <a rel="mw:WikiLink" href="/wiki/short" title="short">short</a> period of time.' }],
    },
  ],
};

export function stubChrome() {
  const calls = { badge: [], color: [], title: [], alarms: [], scripts: [] };
  const store = {};
  globalThis.chrome = {
    action: {
      setBadgeText: ({ text }) => calls.badge.push(text),
      setBadgeBackgroundColor: ({ color }) => calls.color.push(color),
      setTitle: ({ title }) => calls.title.push(title),
    },
    alarms: { create: (name, info) => calls.alarms.push([name, info]) },
    scripting: { executeScript: async injection => { calls.scripts.push(injection); return [{ result: undefined }]; } },
    storage: {
      local: {
        get: async key => (key in store ? { [key]: structuredClone(store[key]) } : {}),
        set: async obj => { Object.assign(store, structuredClone(obj)); },
      },
    },
  };
  return { calls, store };
}

// dict(url, init) returns a Response; anki(action, params) returns the AnkiConnect reply body. Either may throw.
// AnkiConnect replies from a healthy Anki that already has our note type; `replies` overrides single actions.
const OK_RESULTS = { modelNames: ['Auto Anki'], deckNames: ['Auto Anki', 'Default', 'English vocab'] };
export const ankiOk = (replies = {}) => action => replies[action] ?? { result: OK_RESULTS[action] ?? 1, error: null };

export function stubFetch({ dict = () => json(EPHEMERAL), anki = ankiOk() } = {}) {
  const dictUrls = [];
  const ankiRequests = [];
  globalThis.fetch = async (url, init = {}) => {
    if (url.startsWith('https://en.wiktionary.org/')) {
      dictUrls.push(url);
      return dict(url, init);
    }
    if (url === 'http://127.0.0.1:8765') {
      ankiRequests.push({ method: init.method, body: JSON.parse(init.body) });
      const { action, params } = JSON.parse(init.body);
      return json(await anki(action, params));
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  return { dictUrls, ankiRequests, ankiActions: () => ankiRequests.map(r => r.body.action) };
}

export const ankiDown = () => { throw new TypeError('fetch failed'); };
