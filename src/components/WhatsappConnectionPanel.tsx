import React, { useState, useEffect, useCallback } from 'react';
import { MessageCircle, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

interface WaStatus {
  connected: boolean;
  qrDataUrl: string | null;
  error?: string;
}

export function WhatsappConnectionPanel() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) setStatus(await res.json());
      else setStatus({ connected: false, qrDataUrl: null, error: 'connector_unreachable' });
    } catch {
      setStatus({ connected: false, qrDataUrl: null, error: 'connector_unreachable' });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
    // Si no está conectado, refrescar cada 20 segundos para capturar nuevo QR
    const interval = setInterval(() => {
      if (!status?.connected) fetchStatus();
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchStatus, status?.connected]);

  if (loading) {
    return (
      <div className="bg-white rounded-[20px] border border-gray-100 p-5 flex items-center gap-3">
        <RefreshCw size={16} className="animate-spin text-gray-400" />
        <span className="text-sm text-gray-400">Verificando conexión de WhatsApp...</span>
      </div>
    );
  }

  // Conector no disponible
  if (status?.error === 'connector_unreachable') {
    return (
      <div className="bg-white rounded-[20px] border border-orange-200 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-orange-400" />
          <p className="text-sm font-extrabold text-gray-800">Conector de WhatsApp apagado</p>
        </div>
        <p className="text-xs text-gray-500">
          El servicio de WhatsApp no está corriendo. Inicialo con:
        </p>
        <code className="block text-[11px] bg-gray-50 rounded-xl px-3 py-2 text-gray-600 font-mono">
          cd "Faces panel de pedido/whatsapp-conector" && node index.js
        </code>
        <button
          onClick={fetchStatus}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-50 text-orange-600 text-xs font-bold hover:bg-orange-100 transition-colors"
        >
          <RefreshCw size={12} /> Reintentar
        </button>
      </div>
    );
  }

  // Conectado
  if (status?.connected) {
    return (
      <div className="bg-white rounded-[20px] border border-green-200 p-5 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} className="text-green-500" />
          <p className="text-sm font-extrabold text-gray-800">WhatsApp conectado</p>
        </div>
        <p className="text-xs text-gray-500">El bridge está activo y recibiendo mensajes.</p>
        <button
          onClick={fetchStatus}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50 text-gray-500 text-xs font-bold hover:bg-gray-100 transition-colors"
        >
          <RefreshCw size={11} /> Actualizar estado
        </button>
      </div>
    );
  }

  // QR disponible para escanear
  if (status?.qrDataUrl) {
    return (
      <div className="bg-white rounded-[20px] border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-green-500" />
            <p className="text-sm font-extrabold text-gray-800">Vincular WhatsApp</p>
          </div>
          <button onClick={fetchStatus} className="text-gray-400 hover:text-gray-600">
            <RefreshCw size={14} />
          </button>
        </div>

        <img
          src={status.qrDataUrl}
          alt="QR WhatsApp"
          className="w-56 h-56 mx-auto rounded-2xl border border-gray-100"
        />

        <div className="bg-gray-50 rounded-xl p-3 space-y-1">
          <p className="text-[11px] font-extrabold text-gray-700">Cómo escanear:</p>
          <ol className="text-[11px] text-gray-500 space-y-0.5 list-decimal list-inside">
            <li>Abrí WhatsApp en el celular de la empresa</li>
            <li>Tocá los tres puntitos → <strong>Dispositivos vinculados</strong></li>
            <li>Tocá <strong>Vincular dispositivo</strong></li>
            <li>Apuntá la cámara a este QR</li>
          </ol>
        </div>

        <p className="text-[10px] text-gray-400 text-center">
          El QR se renueva automáticamente cada 20 segundos
        </p>
      </div>
    );
  }

  // Iniciando (sin QR todavía)
  return (
    <div className="bg-white rounded-[20px] border border-gray-100 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <RefreshCw size={16} className="animate-spin text-gray-400" />
        <p className="text-sm font-extrabold text-gray-800">Iniciando conector...</p>
      </div>
      <p className="text-xs text-gray-500">El QR aparecerá en unos segundos. Esta pantalla se actualiza sola.</p>
    </div>
  );
}
