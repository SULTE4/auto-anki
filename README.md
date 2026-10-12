<div align="center">

# Auto Anki

**Google `ephemeral meaning`. Get an Anki card. On every device.**

A tiny Chrome extension that watches for "word meaning" searches and turns each one into a flashcard,<br>
with definitions, part of speech, pronunciation and an example sentence.

![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![Anki](https://img.shields.io/badge/Anki-AnkiConnect-235390)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Tests](https://img.shields.io/badge/tests-node%3Atest-339933?logo=nodedotjs&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

</div>

---

## Why

You already look words up by googling them. Adding them to Anki by hand is the step that never happens. Auto Anki removes it: the search *is* the "add card" button.

## How it works

```
 You google:  ephemeral meaning
                   │
                   ▼
 ┌──────────────────────────────┐   reads the URL only,
 │ Auto Anki (service worker)   │   never the page
 └──────────────┬───────────────┘
                │ "ephemeral"
                ▼
   api.dictionaryapi.dev  ──►  definitions, phonetic, example
                │
                ▼
   AnkiConnect (Anki desktop)  ──►  card in deck "Auto Anki"
                │  ~1 min later
                ▼
   AnkiWeb sync  ──►  AnkiDroid / AnkiMobile / other computers
```

The card looks like this:

| Front | Back |
|---|---|
| ephemeral | /əˈfɛm(ə)ɹəl/<br>1. *(adjective)* Lasting for a short period of time.<br>&nbsp;&nbsp;&nbsp;*"an ephemeral fad"*<br>2. *(noun)* Something which lasts for a short period of time. |

## Features

- **Zero clicks.** Search as you always do; the card is added in the background.
- **Syncs everywhere.** Triggers an AnkiWeb sync about a minute after adding, batched so a burst of lookups syncs once.
- **Never loses a word.** Anki closed or offline? The word is queued and added automatically once Anki is back.
- **No duplicates.** Searching the same word again does nothing.
- **Private by design.** Reads only Google search URLs. No page scraping, no analytics, no accounts, no servers of its own.
- **Tiny.** About 140 lines, zero dependencies, no build step.

## Quick start

**1. Install AnkiConnect in Anki desktop**

`Tools` > `Add-ons` > `Get Add-ons...` > enter code **`2055492159`** > restart Anki.

**2. Log in to AnkiWeb once** (only needed for syncing to other devices)

Click `Sync` in Anki desktop and sign in. You can turn on `Preferences` > `Syncing` > *Automatically sync on profile open/close* too.

**3. Load the extension in Chrome**

```bash
git clone <this repo> auto-anki
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick the `auto-anki` folder.

**4. Try it.** With Anki open, google `ephemeral meaning`. The extension badge shows **+1** and the card is in the **Auto Anki** deck.

## What gets picked up

The query must be the word (or a phrase of up to 3 words) followed by `meaning`. Quotes are optional.

| You search | Card added for |
|---|---|
| `ephemeral meaning` | `ephemeral` |
| `"ephemeral" meaning` / `'ephemeral' meaning` / `“ephemeral” meaning` | `ephemeral` |
| `Ephemeral MEANING` | `ephemeral` |
| `break the ice meaning` | `break the ice` |
| `self-aware meaning` | `self-aware` |

| Ignored | Why |
|---|---|
| `meaning of life` | doesn't end with `meaning` |
| `what does ephemeral mean` | different pattern (maybe later) |
| `ephemeral meaning in hindi` | extra words after `meaning` |
| `four words phrase here meaning` | more than 3 words |
| `covid19 meaning` | digits and symbols aren't words |
| Bing, DuckDuckGo, ... | Google only for now |

## Badge legend

| Badge | Meaning |
|---|---|
| ![+1](https://img.shields.io/badge/-%2B1-2e7d32) | Card added |
| ![=](https://img.shields.io/badge/-%3D-757575) | Already in Anki, skipped |
| ![?](https://img.shields.io/badge/-%3F-f9a825) | No dictionary definition found, skipped |
| ![!](https://img.shields.io/badge/-!-c62828) | Queued: Anki (or the dictionary) wasn't reachable. Retried every 5 minutes and on your next search |

Hover the extension icon to see which word the badge is about.

## Syncing to your phone

Auto Anki asks Anki desktop to sync about a minute after the last card it added. Your phone gets the card the next time it syncs (open AnkiDroid / AnkiMobile and pull to sync, or enable auto sync there).

Anki desktop must be running when you search. If it isn't, the words wait in the queue and are added and synced the next time it is open.

## Troubleshooting

<details>
<summary><b>Badge stays on <code>!</code> even though Anki is open</b></summary>

1. Check AnkiConnect is answering:
   ```bash
   curl -s localhost:8765 -d '{"action":"version","version":6}'
   # {"result": 6, "error": null}
   ```
2. If that works but the extension still fails, AnkiConnect may be rejecting the extension's origin. Find the extension ID on `chrome://extensions`, then in Anki open `Tools` > `Add-ons` > `AnkiConnect` > `Config` and add it:
   ```json
   "webCorsOriginList": ["http://localhost", "chrome-extension://<your-extension-id>"]
   ```
   Restart Anki.
3. Hover the extension icon: the tooltip shows the exact error.
</details>

<details>
<summary><b>"model was not found: Basic"</b></summary>

Cards use Anki's built-in **Basic** note type. If you renamed or deleted it, recreate it under `Tools` > `Manage Note Types` > `Add` > `Add: Basic`.
</details>

<details>
<summary><b>Cards don't show up on my phone</b></summary>

Make sure Anki desktop is logged in to AnkiWeb (click `Sync` once), then sync on the phone. The extension's sync runs about a minute after the last added card.
</details>

<details>
<summary><b>Where are the logs?</b></summary>

`chrome://extensions` > Auto Anki > **Inspect views: service worker** > Console.
</details>

## Development

No dependencies, no build. Node 20+ for the tests.

```bash
npm test
```

```
auto-anki/
├── manifest.json      # MV3 manifest
├── background.js      # wires Chrome events to src/flow.js
├── src/
│   ├── parse.js       # Google URL -> word, or null
│   ├── dictionary.js  # dictionaryapi.dev lookup
│   ├── card.js        # HTML for the back of the card (escaped)
│   ├── anki.js        # AnkiConnect client: addWord, sync
│   └── flow.js        # glue: dedupe, badge, queue, sync alarm
└── test/              # node:test, network and chrome.* stubbed
```

After changing the code, click the reload icon on the extension card in `chrome://extensions`.

## Roadmap

- [ ] More query patterns: `define X`, `X definition`, `what does X mean`
- [ ] Bing and DuckDuckGo
- [ ] Popup with recent words and settings (deck name, on/off)
- [ ] Other languages and translation cards
- [ ] Audio pronunciation on the card
- [ ] Extension icon

## License

[MIT](LICENSE)
