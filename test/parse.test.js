import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWord } from '../src/parse.js';

const search = q => `https://www.google.com/search?q=${encodeURIComponent(q)}&oq=x&sourceid=chrome`;

test('extracts the word from matching queries', () => {
  const cases = [
    ['ephemeral meaning', 'ephemeral'],
    ['"ephemeral" meaning', 'ephemeral'],
    ["'ephemeral' meaning", 'ephemeral'],
    ['“ephemeral” meaning', 'ephemeral'],
    ['‘ephemeral’ meaning', 'ephemeral'],
    ['Ephemeral MEANING', 'ephemeral'],
    ['  ephemeral    meaning  ', 'ephemeral'],
    ['break the ice meaning', 'break the ice'],
    ['self-aware meaning', 'self-aware'],
    ["don't meaning", "don't"],
    ['café meaning', 'café'],
    ['Ärger meaning', 'ärger'],
    ['a meaning', 'a'],
  ];
  for (const [q, word] of cases) assert.equal(extractWord(search(q)), word, q);
});

test('decodes both + and %20 as spaces in q', () => {
  assert.equal(extractWord('https://www.google.com/search?q=ephemeral+meaning'), 'ephemeral');
  assert.equal(extractWord('https://www.google.com/search?q=ephemeral%20meaning'), 'ephemeral');
  assert.equal(extractWord('https://www.google.com/search?q=%22ephemeral%22+meaning'), 'ephemeral');
});

test('ignores queries that are not "<word> meaning"', () => {
  const cases = [
    'meaning of life',
    'what does ephemeral mean',
    'meaning',
    ' meaning',
    'ephemeral meanings',
    'ephemeral meaning in hindi',
    'ephemeralmeaning',
    'four words phrase here meaning',
    'covid19 meaning',
    'c++ meaning',
    'ephemeral? meaning',
    '"" meaning',
    '"ephemeral meaning"',
    '',
    '   ',
  ];
  for (const q of cases) assert.equal(extractWord(search(q)), null, JSON.stringify(q));
});

test('ignores a missing q param', () => {
  assert.equal(extractWord('https://www.google.com/search?tbm=isch'), null);
});

test('accepts google.com with or without www', () => {
  for (const host of ['www.google.com', 'google.com', 'WWW.GOOGLE.COM']) {
    assert.equal(extractWord(`https://${host}/search?q=ephemeral+meaning`), 'ephemeral', host);
  }
});

test('ignores Google country domains (no host permission for them yet)', () => {
  for (const host of ['www.google.de', 'www.google.co.uk', 'www.google.com.br', 'www.google.kz']) {
    assert.equal(extractWord(`https://${host}/search?q=ephemeral+meaning`), null, host);
  }
});

test('ignores non-Google hosts and lookalikes', () => {
  for (const host of ['www.bing.com', 'duckduckgo.com', 'google.com.evil.com', 'evilgoogle.com', 'www.google.evil.com', 'mail.google.com', 'www.google.co']) {
    assert.equal(extractWord(`https://${host}/search?q=ephemeral+meaning`), null, host);
  }
});

test('ignores Google pages other than /search', () => {
  for (const path of ['/', '/maps', '/searchx', '/search/about', '/url']) {
    assert.equal(extractWord(`https://www.google.com${path}?q=ephemeral+meaning`), null, path);
  }
});

test('ignores non-https and malformed URLs', () => {
  assert.equal(extractWord('http://www.google.com/search?q=ephemeral+meaning'), null);
  assert.equal(extractWord('not a url'), null);
  assert.equal(extractWord(''), null);
  assert.equal(extractWord(undefined), null);
});
