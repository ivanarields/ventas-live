import React, { useState, useEffect, useCallback } from 'react';
import { MessageCircle, RefreshCw, CheckCircle2, AlertTriangle, Settings2 } from 'lucide-react';
import { WhatsappHealthBadge } from './WhatsappHealthBadge';

interface WaStatus {
  connected: boolean;
  qrDataUrl: string | null;
  error?: string;
  service?: string;
  timestamp?: string;
}

export function WhatsappConnectionPanel() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json().catch(() => null);
      if (res.ok && data) setStatus(data);
      else setStatus({ connected: false, qrDataUrl: null, error: data?.error || 'bridge_unreachable' });
    } catch {
      setStatus({ connected: false, qrDataUrl: null, error: 'bridge_unreachable' });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      if (!status?.connected) fetchStatus();
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchStatus, status?.connected]);

  return (
    <div className="bg-white rounded-[20px] border border-gray-100 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-50 px-4 pt-4 pb-2">
        <div className="flex gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-[#ff2d78] text-white">
            <Settings2 size={13} /> Conexion
          </span>
        </div>
        <WhatsappHealthBadge className="hidden sm:inline-flex" />
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-3 py-4">
                <RefreshCw size={16} className="animate-spin text-gray-400" />
                <span className="text-sm text-gray-400">Verificando conexion...</span>
              </div>
            ) : status?.error === 'connector_unreachable' || status?.error === 'bridge_unreachable' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-orange-400" />
                  <p className="text-sm font-extrabold text-gray-800">Bridge de WhatsApp sin respuesta</p>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  El servicio de Railway no respondio al chequeo. Los mensajes pueden detenerse hasta que el bridge se reinicie o vuelva a estar conectado.
                </p>
                <button
                  onClick={fetchStatus}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 text-orange-600 text-xs font-bold hover:bg-orange-100 transition-colors"
                >
                  <RefreshCw size={12} /> Reintentar
                </button>
              </div>
            ) : status?.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-green-500" />
                  <p className="text-sm font-extrabold text-gray-800">WhatsApp conectado</p>
                </div>
                <p className="text-xs text-gray-500">El bridge esta activo y recibiendo mensajes.</p>
                <button
                  onClick={fetchStatus}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50 text-gray-400 text-[10px] font-bold hover:bg-gray-100 transition-colors"
                >
                  <RefreshCw size={11} /> Forzar actualizacion
                </button>
              </div>
            ) : status?.qrDataUrl ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <MessageCircle size={16} className="text-green-500" />
                  <p className="text-sm font-extrabold text-gray-800">Vincular WhatsApp</p>
                </div>

                <img
                  src={status.qrDataUrl}
                  alt="QR WhatsApp"
                  className="w-48 h-48 mx-auto rounded-2xl border border-gray-100 shadow-sm"
                />

                <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-[10px] leading-tight">
                  <p className="font-extrabold text-gray-700">Como escanear:</p>
                  <ol className="text-gray-500 space-y-0.5 list-decimal list-inside">
                    <li>Abri WhatsApp en el celular</li>
                    <li>Dispositivos vinculados</li>
                    <li>Vincular dispositivo</li>
                  </ol>
                </div>

                <p className="text-[10px] text-gray-400 text-center italic">
                  El QR se renueva cada 20 segundos
                </p>
              </div>
            ) : (
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-2">
                  <RefreshCw size={16} className="animate-spin text-gray-400" />
                  <p className="text-sm font-extrabold text-gray-800">Iniciando...</p>
                </div>
                <p className="text-xs text-gray-500">El QR aparecera en unos segundos.</p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
