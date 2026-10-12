import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBack } from '../src/card.js';

test('renders numbered senses with examples', () => {
  const html = renderBack({
    senses: [
      { partOfSpeech: 'adjective', definition: 'Lasting for a short period of time.', example: 'an ephemeral fad' },
      { partOfSpeech: 'noun', definition: 'Something short-lived.' },
    ],
  });
  assert.equal(html,
    '<ol>'
    + '<li><i>(adjective)</i> Lasting for a short period of time.<br><i>"an ephemeral fad"</i></li>'
    + '<li><i>(noun)</i> Something short-lived.</li>'
    + '</ol>');
});

test('omits the example line when the example is missing or empty', () => {
  assert.equal(
    renderBack({ senses: [{ partOfSpeech: 'verb', definition: 'To run.' }, { partOfSpeech: 'verb', definition: 'To go.', example: '' }] }),
    '<ol><li><i>(verb)</i> To run.</li><li><i>(verb)</i> To go.</li></ol>');
});

test('escapes HTML in every dictionary field', () => {
  const html = renderBack({
    senses: [{ partOfSpeech: '<img src=x onerror=alert(1)>', definition: '<script>alert(1)</script> & "q" \'s\'', example: '</i><script>' }],
  });
  assert.doesNotMatch(html, /<script|<img/);
  assert.equal(html,
    '<ol><li><i>(&#60;img src=x onerror=alert(1)&#62;)</i> '
    + '&#60;script&#62;alert(1)&#60;/script&#62; &#38; &#34;q&#34; &#39;s&#39;'
    + '<br><i>"&#60;/i&#62;&#60;script&#62;"</i></li></ol>');
});
