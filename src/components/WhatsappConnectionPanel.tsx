import React, { useState, useEffect, useCallback } from 'react';
import { MessageCircle, RefreshCw, CheckCircle2, AlertTriangle, Send, Settings2 } from 'lucide-react';
import { WhatsappQueue } from './WhatsappQueue';
import { WhatsappHealthBadge } from './WhatsappHealthBadge';


interface WaStatus {
  connected: boolean;
  qrDataUrl: string | null;
  error?: string;
}

export function WhatsappConnectionPanel() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'connection' | 'queue'>('connection');


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

  return (
    <div className="bg-white rounded-[20px] border border-gray-100 flex flex-col h-full overflow-hidden">
      {/* Header con tabs */}
      <div className="flex items-center justify-between border-b border-gray-50 px-4 pt-4 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('connection')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              activeTab === 'connection'
                ? 'bg-[#ff2d78] text-white'
                : 'text-gray-400 hover:bg-gray-50'
            }`}
          >
            <Settings2 size={13} /> Conexión
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              activeTab === 'queue'
                ? 'bg-[#ff2d78] text-white'
                : 'text-gray-400 hover:bg-gray-50'
            }`}
          >
            <Send size={13} /> Mensajería
          </button>
        </div>
        <WhatsappHealthBadge className="hidden sm:inline-flex" />
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        {activeTab === 'connection' ? (
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-3 py-4">
                <RefreshCw size={16} className="animate-spin text-gray-400" />
                <span className="text-sm text-gray-400">Verificando conexión...</span>
              </div>
            ) : status?.error === 'connector_unreachable' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-orange-400" />
                  <p className="text-sm font-extrabold text-gray-800">Conector apagado</p>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  El servicio de WhatsApp no está corriendo. Inicialo con:
                </p>
                <code className="block text-[10px] bg-gray-50 rounded-xl px-3 py-2 text-gray-600 font-mono break-all">
                  node "Faces panel de pedido/whatsapp-conector/index.js"
                </code>
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
                <p className="text-xs text-gray-500">El bridge está activo y recibiendo mensajes.</p>
                <button
                  onClick={fetchStatus}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50 text-gray-400 text-[10px] font-bold hover:bg-gray-100 transition-colors"
                >
                  <RefreshCw size={11} /> Forzar actualización
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
                  <p className="font-extrabold text-gray-700">Cómo escanear:</p>
                  <ol className="text-gray-500 space-y-0.5 list-decimal list-inside">
                    <li>Abrí WhatsApp en el celular</li>
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
                <p className="text-xs text-gray-500">El QR aparecerá en unos segundos.</p>
              </div>
            )}
          </div>
        ) : (
          <WhatsappQueue />
        )}
      </div>
    </div>
  );
}
