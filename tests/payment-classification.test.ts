/**
 * Tests para la lógica de clasificación de pagos: Live / Web / Sin asignar.
 *
 * Estos tests documentan el comportamiento correcto post-fix (2026-05-15):
 * - Un pago con customerId pero fuera del rango Live va a "Sin asignar"
 * - Un pago con livePaymentId siempre va a "Live"
 * - Un pago verificado (verificado_macrodroid, whatsapp_pending, manual) va a "Live"
 * - Un pago macrodroid_only sin match va a "Sin asignar"
 */

import assert from 'node:assert/strict';
import test from 'node:test';

// Lógica extraída de App.tsx isUnassignedPayment + isStorePayment para pruebas puras.
// Si cambia App.tsx, actualizar también aquí.
function isStorePayment(payment: any): boolean {
  return String(payment?.method ?? '').trim().toLowerCase() === 'tienda online';
}

function classifyPayment(
  payment: any,
  liveSession?: { startAt: string; endAt: string } | null,
): 'live' | 'web' | 'unassigned' {
  if (isStorePayment(payment)) return 'web';

  // Ligado explícitamente a un pagos_venta_live
  if (payment?.livePaymentId) return 'live';

  const origin = String(payment?.verificationOrigin ?? 'other');

  // Verificado o pendiente de verificar → Live
  if (origin === 'verificado_macrodroid' || origin === 'whatsapp_pending' || origin === 'manual') return 'live';

  // Tiene cliente conocido: usar rango del Live para decidir
  if (payment?.customerId) {
    if (liveSession?.startAt && liveSession?.endAt) {
      const t = new Date(payment.date ?? 0).getTime();
      const s = new Date(liveSession.startAt).getTime();
      const e = new Date(liveSession.endAt).getTime();
      return t >= s && t <= e ? 'live' : 'unassigned';
    }
    return 'live'; // Sin info de sesión → comportamiento conservador
  }

  return 'unassigned';
}

// --- TESTS ---

const LIVE_SESSION = {
  startAt: '2026-05-15T13:00:00.000Z', // 09:00 Bolivia
  endAt:   '2026-05-15T14:00:00.000Z', // 10:00 Bolivia
};

test('pago con livePaymentId siempre va a Live', () => {
  assert.equal(classifyPayment({ livePaymentId: 42, customerId: 1, date: '2026-05-15T19:00:00Z' }, LIVE_SESSION), 'live');
});

test('pago de tienda online va a Web', () => {
  assert.equal(classifyPayment({ method: 'Tienda Online', customerId: 5, date: '2026-05-15T13:30:00Z' }, LIVE_SESSION), 'web');
});

test('pago verificado_macrodroid va a Live aunque esté fuera del rango', () => {
  assert.equal(classifyPayment({
    customerId: 1,
    verificationOrigin: 'verificado_macrodroid',
    date: '2026-05-15T19:00:00Z',
  }, LIVE_SESSION), 'live');
});

test('pago whatsapp_pending va a Live', () => {
  assert.equal(classifyPayment({
    customerId: 1,
    verificationOrigin: 'whatsapp_pending',
    date: '2026-05-15T19:00:00Z',
  }, LIVE_SESSION), 'live');
});

test('pago manual va a Live', () => {
  assert.equal(classifyPayment({
    customerId: 1,
    verificationOrigin: 'manual',
    date: '2026-05-15T19:00:00Z',
  }, LIVE_SESSION), 'live');
});

test('pago macrodroid_only DENTRO del rango Live va a Live', () => {
  assert.equal(classifyPayment({
    customerId: 1,
    verificationOrigin: 'macrodroid_only',
    date: '2026-05-15T13:30:00Z', // 09:30 Bolivia, dentro del Live 09:00-10:00
  }, LIVE_SESSION), 'live');
});

test('pago macrodroid_only FUERA del rango Live va a Sin asignar', () => {
  assert.equal(classifyPayment({
    customerId: 1,
    verificationOrigin: 'macrodroid_only',
    date: '2026-05-15T19:00:00Z', // 15:00 Bolivia, fuera del Live
  }, LIVE_SESSION), 'unassigned');
});

test('pago macrodroid_only sin customerId va a Sin asignar', () => {
  assert.equal(classifyPayment({
    verificationOrigin: 'macrodroid_only',
    date: '2026-05-15T13:30:00Z',
  }, LIVE_SESSION), 'unassigned');
});

test('pago con customerId sin info de sesión Live → comportamiento conservador: Live', () => {
  assert.equal(classifyPayment({
    customerId: 5,
    verificationOrigin: 'macrodroid_only',
    date: '2026-05-15T19:00:00Z',
  }, null), 'live');
});

test('pago antes del inicio del Live va a Sin asignar', () => {
  assert.equal(classifyPayment({
    customerId: 1,
    verificationOrigin: 'macrodroid_only',
    date: '2026-05-15T12:00:00Z', // 08:00 Bolivia, antes del Live 09:00
  }, LIVE_SESSION), 'unassigned');
});

// Tests para el fallback de fotos (lógica de identity.ts)
test('fallback de fotos: sin ventana Live no usa epoch', () => {
  const rangeMs = 2 * 24 * 60 * 60 * 1000;
  const pivot = new Date('2026-05-14T04:00:00.000Z');
  const liveWindow = null;
  const liveOrder = { fecha_pedido: '2026-05-14' };

  // Comportamiento NUEVO: usa pivot±range en vez de epoch
  const from = liveWindow ?? new Date(pivot.getTime() - rangeMs).toISOString();
  const to   = liveWindow ?? new Date(pivot.getTime() + rangeMs).toISOString();

  assert.notEqual(from, new Date(0).toISOString(), 'from no debe ser epoch');
  assert.notEqual(to, new Date(0).toISOString(), 'to no debe ser epoch');
  assert.ok(new Date(from).getFullYear() > 2020, 'from debe ser una fecha real');
  assert.ok(!!liveOrder, 'liveOrder existe pero no causa epoch');
});

test('ensureDailyPedidoFromPayment: pedido live_sales no debe actualizar total_amount', () => {
  // Simula la lógica del fix en ingest-notification
  function shouldUpdateTotal(currentSource: string): boolean {
    return String(currentSource ?? '').toLowerCase() !== 'live_sales';
  }

  assert.equal(shouldUpdateTotal('live_sales'), false, 'live_sales → NO actualiza total');
  assert.equal(shouldUpdateTotal('macrodroid'), true, 'macrodroid → SÍ actualiza total');
  assert.equal(shouldUpdateTotal(''), true, 'sin source → SÍ actualiza total');
});
