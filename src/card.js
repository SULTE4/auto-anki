// Dictionary text is untrusted: Anki renders the back as HTML.
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export function renderBack({ senses }) {
  const items = senses.map(({ partOfSpeech, definition, example }) =>
    `<li><i>(${esc(partOfSpeech)})</i> ${esc(definition)}${example ? `<br><i>"${esc(example)}"</i>` : ''}</li>`);
  return `<ol>${items.join('')}</ol>`;
}
