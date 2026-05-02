import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findMacrodroidMatchForLivePayment,
  receiptAtFromMessage,
  resolveLivePaymentMatchAt,
} from '../src/services/liveSalesService.ts';

const name = 'IVAN ARIEL DIAZ SANCHEZ';
const messageAt = '2026-05-01T03:45:22.432Z'; // 30/04/2026 23:45 Bolivia
const wrongReceiptAt = receiptAtFromMessage(messageAt, '01:58');

test('usa la hora real del mensaje de WhatsApp aunque la IA lea mal la hora del comprobante', () => {
  const pagoLive = {
    nombre_detectado: name,
    monto: 1,
    comprobante_at: wrongReceiptAt,
    message_created_at: messageAt,
  };

  const match = findMacrodroidMatchForLivePayment(pagoLive, [
    {
      id: 241,
      nombre: name,
      pago: 1,
      date: '2026-05-01T03:54:03.765Z',
      customer_id: 257,
    },
  ], { windowMinutes: 10 });

  assert.equal(match?.id, 241);
});

test('no verifica si solo coincide monto pero el nombre es distinto', () => {
  const pagoLive = {
    nombre_detectado: name,
    monto: 1,
    message_created_at: messageAt,
  };

  const match = findMacrodroidMatchForLivePayment(pagoLive, [
    {
      id: 300,
      nombre: 'OTRA PERSONA',
      pago: 1,
      date: '2026-05-01T03:46:00.000Z',
      customer_id: 999,
    },
  ], { windowMinutes: 5 });

  assert.equal(match, null);
});

test('permite match por customer_id aunque el banco venga con nombre abreviado', () => {
  const pagoLive = {
    nombre_detectado: name,
    monto: 30,
    message_created_at: '2026-05-01T03:19:39.809Z',
  };

  const match = findMacrodroidMatchForLivePayment(pagoLive, [
    {
      id: 242,
      nombre: 'I A DIAZ',
      pago: 30,
      date: '2026-05-01T03:20:10.000Z',
      customer_id: 257,
    },
  ], { mainCustomerId: 257, windowMinutes: 5 });

  assert.equal(match?.id, 242);
});

test('rechaza pagos fuera de la ventana operativa', () => {
  const pagoLive = {
    nombre_detectado: name,
    monto: 1,
    message_created_at: messageAt,
  };

  const match = findMacrodroidMatchForLivePayment(pagoLive, [
    {
      id: 243,
      nombre: name,
      pago: 1,
      date: '2026-05-01T04:20:00.000Z',
      customer_id: 257,
    },
  ], { windowMinutes: 10 });

  assert.equal(match, null);
});

test('si no hay hora de mensaje, cae a la hora del comprobante', () => {
  const pagoLive = {
    nombre_detectado: name,
    monto: 15,
    comprobante_at: '2026-05-01T03:20:00.000Z',
  };

  assert.equal(resolveLivePaymentMatchAt(pagoLive), '2026-05-01T03:20:00.000Z');
});
