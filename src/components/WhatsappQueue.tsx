/**
 * WhatsappQueue.tsx
 * Panel Anti-Baneo de mensajería WhatsApp.
 *
 * Funcionalidades:
 * - Tabla de mensajes con sus estados (pending/sent/failed/cancelled)
 * - Botón "Envío Seguro" con delay aleatorio 2-4 min entre mensajes
 * - Modal bloqueante mientras el envío progresivo está activo
 * - Editar texto de un mensaje antes de enviarlo
 * - Cancelar mensaje pendiente
 * - Reintentar mensaje fallido
 *
 * NO importa ni depende de App.tsx.
 * Se monta como pestaña en WhatsappConnectionPanel.tsx.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Send, Clock, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Edit3, X, RotateCcw, Play, StopCircle,
  MessageSquare, ChevronDown,
} from 'lucide-react';

// ── Tipos ──────────────────────────────────────────────────
type MsgStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';

interface QueuedMessage {
  id: string;
  phone: string;
  message_body: string;
  type: string;
  status: MsgStatus;
  reference_type?: string;
  error_detail?: string;
  sent_at?: string;
  created_at: string;
}

interface QueueStats {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  cancelled: number;
}

// ── Helpers ────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('sb_session');
    if (!raw) return {};
    const session = JSON.parse(raw);
    return {
      'x-user-id': session.user?.id || '',
      'Authorization': `Bearer ${session.token || ''}`,
    };
  } catch {
    return {};
  }
}

function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function formatPhone(phone: string): string {
  // +59178456789 → +591 784 56789
  return phone.replace(/(\+591)(\d{3})(\d{5})/, '$1 $2 $3');
}

function msToMinSec(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

// Badge de estado
function StatusBadge({ status }: { status: MsgStatus }) {
  const cfg: Record<MsgStatus, { label: string; className: string; icon: React.ReactNode }> = {
    pending:   { label: 'Pendiente',  className: 'bg-yellow-100 text-yellow-700', icon: <Clock size={10} /> },
    sending:   { label: 'Enviando',   className: 'bg-blue-100 text-blue-700',     icon: <RefreshCw size={10} className="animate-spin" /> },
    sent:      { label: 'Enviado',    className: 'bg-green-100 text-green-700',   icon: <CheckCircle2 size={10} /> },
    failed:    { label: 'Fallido',    className: 'bg-red-100 text-red-600',       icon: <XCircle size={10} /> },
    cancelled: { label: 'Cancelado',  className: 'bg-gray-100 text-gray-500',     icon: <X size={10} /> },
  };
  const c = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${c.className}`}>
      {c.icon}{c.label}
    </span>
  );
}

// ── Componente principal ───────────────────────────────────
export function WhatsappQueue() {
  const [messages, setMessages]   = useState<QueuedMessage[]>([]);
  const [stats, setStats]         = useState<QueueStats>({ pending: 0, sending: 0, sent: 0, failed: 0, cancelled: 0 });
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<MsgStatus | 'all'>('all');

  // Envío seguro
  const [sending, setSending]           = useState(false);
  const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0, nextIn: 0 });
  const stopRef                         = useRef(false);
  const countdownRef                    = useRef<ReturnType<typeof setInterval> | null>(null);

  // Edición inline
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editText, setEditText]       = useState('');

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    const headers = getAuthHeaders();
    try {
      const [qRes, sRes] = await Promise.all([
        fetch('/api/whatsapp/queue?limit=100', { headers }),
        fetch('/api/whatsapp/queue/stats', { headers }),
      ]);
      if (qRes.ok) setMessages(await qRes.json());
      if (sRes.ok) setStats(await sRes.json());
    } catch { /* silencioso */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // ── Editar mensaje ──────────────────────────────────────
  const startEdit = (msg: QueuedMessage) => {
    setEditingId(msg.id);
    setEditText(msg.message_body);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await fetch(`/api/whatsapp/queue/${editingId}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_body: editText }),
    });
    setEditingId(null);
    fetchQueue();
  };

  // ── Cancelar mensaje ────────────────────────────────────
  const cancelMsg = async (id: string) => {
    await fetch(`/api/whatsapp/queue/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    fetchQueue();
  };

  // ── Reintentar fallido ──────────────────────────────────
  const retryMsg = async (id: string) => {
    await fetch(`/api/whatsapp/retry/${id}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    fetchQueue();
  };

  // ── Envío Seguro Anti-Baneo ─────────────────────────────
  const startSafeMode = async () => {
    const pending = messages.filter(m => m.status === 'pending');
    if (pending.length === 0) return;

    stopRef.current = false;
    setSending(true);
    setSendProgress({ sent: 0, total: pending.length, nextIn: 0 });

    for (let i = 0; i < pending.length; i++) {
      if (stopRef.current) break;

      // Enviar el siguiente de la cola
      await fetch('/api/whatsapp/send-next', {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      const sent = i + 1;
      const isLast = sent === pending.length || stopRef.current;

      setSendProgress(prev => ({ ...prev, sent }));
      await fetchQueue();

      if (!isLast) {
        // Delay aleatorio 2-4 min
        const delayMs = randomDelay(2 * 60 * 1000, 4 * 60 * 1000);
        let remaining = delayMs;
        setSendProgress(prev => ({ ...prev, nextIn: remaining }));

        await new Promise<void>(resolve => {
          countdownRef.current = setInterval(() => {
            remaining -= 1000;
            if (remaining <= 0 || stopRef.current) {
              if (countdownRef.current) clearInterval(countdownRef.current);
              resolve();
            } else {
              setSendProgress(prev => ({ ...prev, nextIn: remaining }));
            }
          }, 1000);
        });
      }
    }

    setSending(false);
    setSendProgress({ sent: 0, total: 0, nextIn: 0 });
    fetchQueue();
  };

  const stopSafeMode = () => {
    stopRef.current = true;
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  // ── Filtrado ────────────────────────────────────────────
  const filtered = filter === 'all' ? messages : messages.filter(m => m.status === filter);

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header con stats */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-[#ff2d78]" />
          <h3 className="text-sm font-extrabold text-gray-800">Cola de Mensajes</h3>
          {stats.pending > 0 && (
            <span className="bg-yellow-100 text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {stats.pending} pendiente{stats.pending !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={fetchQueue}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          title="Actualizar"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats pills */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'pending', 'sent', 'failed', 'cancelled'] as const).map(s => {
          const count = s === 'all'
            ? messages.length
            : stats[s as keyof QueueStats] ?? 0;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                filter === s
                  ? 'bg-[#ff2d78] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 'all' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {/* Botón Envío Seguro */}
      {stats.pending > 0 && !sending && (
        <button
          onClick={startSafeMode}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-[#ff2d78] to-[#ff6b6b] text-white font-bold text-sm hover:opacity-90 transition-opacity shadow-md"
        >
          <Play size={15} />
          Iniciar Envío Seguro ({stats.pending} mensaje{stats.pending !== 1 ? 's' : ''})
        </button>
      )}

      {/* Modal bloqueante durante el envío */}
      {sending && (
        <div className="border-2 border-[#ff2d78] rounded-2xl p-4 bg-[#fff0f3] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send size={14} className="text-[#ff2d78] animate-pulse" />
              <span className="text-sm font-extrabold text-[#ff2d78]">Envío Seguro Activo</span>
            </div>
            <button
              onClick={stopSafeMode}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-red-200 text-red-500 text-xs font-bold hover:bg-red-50 transition-colors"
            >
              <StopCircle size={12} /> Detener
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-white rounded-xl p-2">
              <div className="text-lg font-black text-[#ff2d78]">
                {sendProgress.sent}/{sendProgress.total}
              </div>
              <div className="text-[10px] text-gray-500">Enviados</div>
            </div>
            <div className="bg-white rounded-xl p-2">
              <div className="text-lg font-black text-gray-700">
                {sendProgress.nextIn > 0 ? msToMinSec(sendProgress.nextIn) : '…'}
              </div>
              <div className="text-[10px] text-gray-500">Próximo mensaje</div>
            </div>
          </div>

          <p className="text-[10px] text-gray-500 text-center">
            ⚠️ No cierres esta pestaña mientras se envían los mensajes
          </p>
        </div>
      )}

      {/* Lista de mensajes */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <RefreshCw size={16} className="animate-spin mr-2" />
          <span className="text-sm">Cargando...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay mensajes {filter !== 'all' ? `en estado "${filter}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {filtered.map(msg => (
            <div
              key={msg.id}
              className={`bg-white border rounded-2xl p-3 space-y-2 transition-all ${
                msg.status === 'failed' ? 'border-red-200' :
                msg.status === 'sent'   ? 'border-green-100' :
                msg.status === 'pending' ? 'border-yellow-200' :
                'border-gray-100'
              }`}
            >
              {/* Fila superior: teléfono + badge */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 font-mono">
                  {formatPhone(msg.phone)}
                </span>
                <StatusBadge status={msg.status} />
              </div>

              {/* Cuerpo del mensaje */}
              {editingId === msg.id ? (
                <div className="space-y-2">
                  <textarea
                    className="w-full text-xs border border-gray-200 rounded-xl p-2 resize-none focus:outline-none focus:border-[#ff2d78]"
                    rows={3}
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="flex-1 py-1.5 rounded-xl bg-[#ff2d78] text-white text-xs font-bold hover:opacity-90"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 py-1.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold hover:bg-gray-200"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                  {msg.message_body}
                </p>
              )}

              {/* Error detail si falló */}
              {msg.status === 'failed' && msg.error_detail && (
                <p className="text-[10px] text-red-500 bg-red-50 rounded-lg px-2 py-1">
                  ⚠️ {msg.error_detail}
                </p>
              )}

              {/* Metadatos */}
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span>{new Date(msg.created_at).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                {msg.reference_type && (
                  <span className="bg-gray-50 px-1.5 py-0.5 rounded-full">{msg.reference_type}</span>
                )}
              </div>

              {/* Acciones (solo si pending o failed) */}
              {(msg.status === 'pending' || msg.status === 'failed') && !sending && (
                <div className="flex gap-1.5 pt-1">
                  {msg.status === 'pending' && (
                    <button
                      onClick={() => startEdit(msg)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-500 text-[10px] font-bold hover:bg-gray-100 transition-colors"
                    >
                      <Edit3 size={9} /> Editar
                    </button>
                  )}
                  {msg.status === 'failed' && (
                    <button
                      onClick={() => retryMsg(msg.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-50 text-yellow-600 text-[10px] font-bold hover:bg-yellow-100 transition-colors"
                    >
                      <RotateCcw size={9} /> Reintentar
                    </button>
                  )}
                  <button
                    onClick={() => cancelMsg(msg.id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 text-red-400 text-[10px] font-bold hover:bg-red-100 transition-colors"
                  >
                    <X size={9} /> Cancelar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
