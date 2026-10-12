// Stubs for what can't run under Node: the network and the chrome.* extension APIs.

export const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

// Trimmed real response from api.dictionaryapi.dev for "ephemeral".
export const EPHEMERAL = [{
  word: 'ephemeral',
  phonetic: '/əˈfɛm(ə)ɹəl/',
  meanings: [
    { partOfSpeech: 'adjective', definitions: [{ definition: 'Lasting for a short period of time.', example: 'an ephemeral fad' }] },
    { partOfSpeech: 'noun', definitions: [{ definition: 'Something which lasts for a short period of time.' }] },
  ],
}];

export function stubChrome() {
  const calls = { badge: [], color: [], title: [], alarms: [] };
  const store = {};
  globalThis.chrome = {
    action: {
      setBadgeText: ({ text }) => calls.badge.push(text),
      setBadgeBackgroundColor: ({ color }) => calls.color.push(color),
      setTitle: ({ title }) => calls.title.push(title),
    },
    alarms: { create: (name, info) => calls.alarms.push([name, info]) },
    storage: {
      local: {
        get: async key => (key in store ? { [key]: structuredClone(store[key]) } : {}),
        set: async obj => { Object.assign(store, structuredClone(obj)); },
      },
    },
  };
  return { calls, store };
}

// dict(url) returns a Response; anki(action, params) returns the AnkiConnect reply body. Either may throw.
export function stubFetch({ dict = () => json(EPHEMERAL), anki = () => ({ result: null, error: null }) } = {}) {
  const dictUrls = [];
  const ankiRequests = [];
  globalThis.fetch = async (url, init) => {
    if (url.startsWith('https://api.dictionaryapi.dev/')) {
      dictUrls.push(url);
      return dict(url);
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
