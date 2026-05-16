import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMediaPath } from '../bridge/media-path.js';

test('dos imagenes en el mismo segundo usan rutas distintas si tienen mensajes distintos', () => {
  const timestamp = 1778946985;
  const first = buildMediaPath(
    '59177050026',
    timestamp,
    'image/jpeg',
    'false_267830201192488@lid_A5DF4C6A0A6B29E645B2B1489FF51148',
    'fallback',
  );
  const second = buildMediaPath(
    '59177050026',
    timestamp,
    'image/jpeg',
    'false_267830201192488@lid_A5FCE9C042C924B6C3E7A1FEAE99861A',
    'fallback',
  );

  assert.notEqual(first, second);
  assert.match(first, /^59177050026\/1778946985-.+\.jpg$/);
  assert.match(second, /^59177050026\/1778946985-.+\.jpg$/);
});
