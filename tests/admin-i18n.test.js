import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { de, errorMessages, fallbackError, makeT } from '../src/admin-i18n.js';

const files = ['src/Admin.jsx', 'src/GoogleSettings.jsx', 'src/App.jsx'];
const bosnianFree = ['src/Admin.jsx', 'src/GoogleSettings.jsx', 'src/admin-i18n.js', 'src/admin-de.js'];
const source = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const used = () => new Set(files.flatMap(file => [...source(file).matchAll(/\bt\((?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)].map(m => m[1] ?? m[2])));

test('every owner panel text and error message has a German translation', () => {
  const missing = [...used(), ...Object.values(errorMessages), fallbackError].filter(key => !(key in de));
  assert.deepEqual(missing, []);
});

test('German entries are real translations with the same placeholders as the English source', () => {
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join();
  for (const [english, german] of Object.entries(de)) {
    assert.ok(german.trim(), `empty translation for: ${english}`);
    assert.equal(placeholders(german), placeholders(english), `placeholders differ: ${english}`);
  }
  assert.ok(Object.keys(de).length > 200);
});

test('no unused German entries pile up', () => {
  const keys = new Set([...used(), ...Object.values(errorMessages), fallbackError]);
  assert.deepEqual(Object.keys(de).filter(key => !keys.has(key)), []);
});

test('owner panel files contain no Bosnian text', () => {
  // Bosnian/Croatian letters that neither English nor German use.
  const bosnian = /[šđčćžŠĐČĆŽ]/;
  for (const file of bosnianFree) assert.ok(!bosnian.test(source(file)), `${file} still has Bosnian letters`);
});

test('translator fills placeholders and falls back to the English text', () => {
  const en = makeT('en'), german = makeT('de');
  assert.equal(en('{count} test orders archived.', { count: 3 }), '3 test orders archived.');
  assert.equal(german('{count} test orders archived.', { count: 3 }), '3 Testbestellungen archiviert.');
  assert.equal(german('A text nobody translated yet'), 'A text nobody translated yet');
  assert.equal(german('Last webhook: {when}'), 'Letzter Webhook: {when}');
  assert.equal(en(errorMessages.LAST_OWNER), 'The last active owner must keep access.');
  assert.equal(german(errorMessages.OWNER_MFA_REQUIRED), 'Aktivieren Sie die Zwei-Faktor-Anmeldung, um auf das Produktivpanel zuzugreifen.');
});
