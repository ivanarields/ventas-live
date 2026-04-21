import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, RefreshCw, Package, Trash2, Sparkles, Clock, Image, MessageSquare, AlertCircle, CheckCircle, Settings, Key, X, Eye, EyeOff } from 'lucide-react';

const PANEL_URL   = 'https://vwaocoaeenavxkcshyuf.supabase.co';
const PANEL_KEY   = 'sb_publishable_Rdo7g5SEvzS7BfJCn33k3g_dcuU64Vz';
const SUMM_URL    = `${PANEL_URL}/functions/v1/summarize-conversation`;
const H = { apikey: PANEL_KEY, Authorization: `Bearer ${PANEL_KEY}` };

interface Cliente {
  id: string; phone: string; last_interaction: string;
  resumen?: string; resumen_at?: string; estado?: string;
}
interface Mensaje {
  id: string; cliente_id: string; direction: string;
  content?: string; has_media: boolean; media_url?: string;
  media_type?: string; created_at: string;
}
interface ResumenIA {
  pedido?: string; cantidad?: string; talla?: string;
  pago?: string; entrega?: string; notas?: string;
}

function fmt(p: string) {
  if (!p) return 'Sin número';
  if (p.length > 15) return `Grupo ${p.slice(-6)}`;
  if (p.startsWith('591') && p.length >= 11) return `+591 ${p.slice(3,5)} ${p.slice(5,8)} ${p.slice(8)}`;
  return `+${p}`;
}
function ago(f: string) {
  const d = Date.now() - new Date(f).getTime(), m = Math.floor(d/60000);
  if (m < 1) return 'ahora'; if (m < 60) return `${m}m`; const h = Math.floor(m/60);
  if (h < 24) return `${h}h`; return new Date(f).toLocaleDateString('es-BO',{day:'numeric',month:'short'});
}
function isImage(u='') { return /\.(jpg|jpeg|png|webp|gif)/i.test(u); }

async function api<T>(path: string): Promise<T> {
  const r = await fetch(`${PANEL_URL}/rest/v1/${path}`, { headers: H });
  return r.json();
}

// ─── Detalle de un pedido ────────────────────────────────────────
function DetallePedido({ cliente, onVolver, onBorrar }: {
  cliente: Cliente; onVolver: () => void; onBorrar: (id: string) => void;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [resumen, setResumen]   = useState<ResumenIA | null>(null);
  const [resumeRaw, setResumeRaw] = useState<string | null>(cliente.resumen || null);
  const [generando, setGenerando] = useState(false);
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fotos = mensajes.filter(m => m.has_media && m.media_url && isImage(m.media_url));

  // Parsear resumen JSON
  useEffect(() => {
    if (resumeRaw) {
      try { setResumen(JSON.parse(resumeRaw)); }
      catch { setResumen({ pedido: resumeRaw }); }
    }
  }, [resumeRaw]);

  const cargarMensajes = useCallback(async () => {
    const data = await api<Mensaje[]>(`panel_mensajes?cliente_id=eq.${cliente.id}&select=*&order=created_at.asc`);
    setMensajes(data);
    return data;
  }, [cliente.id]);

  // Al abrir: cargar mensajes y verificar si resumen está desactualizado
  useEffect(() => {
    cargarMensajes().then(msgs => {
      const ultimo = msgs[msgs.length - 1]?.created_at;
      const resumenAt = cliente.resumen_at;
      const desactualizado = !resumenAt || !cliente.resumen || (ultimo && new Date(ultimo) > new Date(resumenAt));
      if (desactualizado && msgs.length > 0) generarResumen();
    });
  }, []);

  const generarResumen = async () => {
    setGenerando(true);
    try {
      const geminiKey = localStorage.getItem('panel_gemini_key') || '';
      const r = await fetch(SUMM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: PANEL_KEY, Authorization: `Bearer ${PANEL_KEY}` },
        body: JSON.stringify({ clienteId: cliente.id, ...(geminiKey ? { geminiKey } : {}) }),
      });
      const j = await r.json();
      if (j.resumen) {
        setResumen(j.resumen);
        setResumeRaw(JSON.stringify(j.resumen));
      }
    } catch (e) { console.error(e); }
    setGenerando(false);
  };

  const borrarConversacion = async () => {
    // Borrar mensajes de la DB
    await fetch(`${PANEL_URL}/rest/v1/panel_mensajes?cliente_id=eq.${cliente.id}`, {
      method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' },
    });
    // Borrar cliente
    await fetch(`${PANEL_URL}/rest/v1/panel_clientes?id=eq.${cliente.id}`, {
      method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' },
    });
    onBorrar(cliente.id);
    onVolver();
  };

  const tieneNuevosMensajes = mensajes.length > 0 && cliente.resumen_at &&
    new Date(mensajes[mensajes.length-1].created_at) > new Date(cliente.resumen_at);

  return (
    <div className="min-h-screen pb-28" style={{ background: '#f8f9fb' }}>
      {/* Header */}
      <div className="bg-white px-4 pt-5 pb-4 border-b border-slate-100 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onVolver} className="flex items-center gap-1 text-[#ff2d78] font-bold text-sm">
            <ChevronLeft size={18} /> Volver
          </button>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Detalle del pedido</span>
          <button onClick={() => setConfirmDelete(true)} className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100">
            <Trash2 size={15} />
          </button>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#ff2d78]">Número del cliente</p>
        <h2 className="text-2xl font-black text-slate-800 leading-tight">{fmt(cliente.phone)}</h2>
        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
          <Clock size={10} /> Último mensaje: {ago(cliente.last_interaction)}
        </p>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-2 gap-3 px-4 mt-4">
        <div className="bg-white rounded-2xl p-3 text-center border border-slate-100 shadow-sm">
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-1">
            <Image size={15} className="text-blue-500" />
          </div>
          <p className="text-xl font-black text-blue-600">{fotos.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Fotos</p>
        </div>
        <div className="bg-white rounded-2xl p-3 text-center border border-slate-100 shadow-sm">
          <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center mx-auto mb-1">
            <MessageSquare size={15} className="text-[#ff2d78]" />
          </div>
          <p className="text-xl font-black text-[#ff2d78]">{mensajes.filter(m=>m.content).length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase">Mensajes</p>
        </div>
      </div>

      {/* RESUMEN IA */}
      <div className="mx-4 mt-4 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[#ff2d78]" />
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Resumen del pedido</p>
            {tieneNuevosMensajes && (
              <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-0.5 rounded-full">Mensajes nuevos</span>
            )}
          </div>
          <button onClick={generarResumen} disabled={generando}
            className="flex items-center gap-1 text-xs text-[#ff2d78] font-bold hover:opacity-70 disabled:opacity-40">
            <RefreshCw size={11} className={generando ? 'animate-spin' : ''} />
            {generando ? 'Generando...' : 'Actualizar'}
          </button>
        </div>

        <div className="p-4">
          {generando ? (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-8 h-8 rounded-full border-[3px] border-[#ff2d78] border-t-transparent animate-spin" />
              <p className="text-xs text-slate-400">Analizando conversación con IA...</p>
            </div>
          ) : resumen ? (
            <div className="space-y-3">
              {resumen.pedido && (
                <div className="bg-pink-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase text-[#ff2d78] mb-1">📦 Pedido</p>
                  <p className="text-sm text-slate-700 font-medium leading-relaxed">{resumen.pedido}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {resumen.cantidad && resumen.cantidad !== 'no especificado' && (
                  <div className="bg-slate-50 rounded-xl p-2.5">
                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-0.5">Cantidad</p>
                    <p className="text-sm font-bold text-slate-700">{resumen.cantidad}</p>
                  </div>
                )}
                {resumen.talla && resumen.talla !== 'no especificada' && (
                  <div className="bg-slate-50 rounded-xl p-2.5">
                    <p className="text-[9px] font-bold uppercase text-slate-400 mb-0.5">Talla</p>
                    <p className="text-sm font-bold text-slate-700">{resumen.talla}</p>
                  </div>
                )}
                {resumen.pago && resumen.pago !== 'no especificado' && (
                  <div className="bg-green-50 rounded-xl p-2.5">
                    <p className="text-[9px] font-bold uppercase text-green-500 mb-0.5">Pago</p>
                    <p className="text-sm font-bold text-green-700">{resumen.pago}</p>
                  </div>
                )}
                {resumen.entrega && resumen.entrega !== 'no especificado' && (
                  <div className="bg-blue-50 rounded-xl p-2.5">
                    <p className="text-[9px] font-bold uppercase text-blue-500 mb-0.5">Entrega</p>
                    <p className="text-sm font-bold text-blue-700">{resumen.entrega}</p>
                  </div>
                )}
              </div>
              {resumen.notas && resumen.notas !== 'null' && (
                <div className="bg-yellow-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase text-yellow-600 mb-1">📝 Notas</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{resumen.notas}</p>
                </div>
              )}
              {cliente.resumen_at && (
                <p className="text-[10px] text-slate-300 text-right">
                  Generado: {new Date(cliente.resumen_at).toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit'})}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 gap-2 text-slate-400">
              <AlertCircle size={24} />
              <p className="text-sm">Sin resumen generado</p>
              <button onClick={generarResumen} className="text-xs text-[#ff2d78] font-bold">Generar ahora</button>
            </div>
          )}
        </div>
      </div>

      {/* GALERÍA DE FOTOS */}
      {fotos.length > 0 && (
        <div className="mx-4 mt-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
            Fotografías del pedido ({fotos.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {fotos.map((m, i) => (
              <button key={m.id} onClick={() => setFotoGrande(m.media_url!)}
                className="aspect-square rounded-xl overflow-hidden border border-slate-100 shadow-sm hover:scale-[1.03] transition-transform active:scale-95">
                <img src={m.media_url!} alt={`foto ${i+1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal foto */}
      {fotoGrande && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setFotoGrande(null)}>
          <img src={fotoGrande} alt="vista completa" className="max-w-full max-h-full object-contain rounded-2xl" />
        </div>
      )}

      {/* Modal confirmar borrado */}
      {confirmDelete && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h3 className="text-base font-black text-slate-800 text-center mb-2">¿Borrar conversación?</h3>
            <p className="text-xs text-slate-500 text-center mb-5">
              Se eliminarán todos los mensajes y archivos de {fmt(cliente.phone)}. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm">
                Cancelar
              </button>
              <button onClick={borrarConversacion}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white font-bold text-sm">
                Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modal Configuración IA ─────────────────────────────────────
function ModalConfigIA({ onClose }: { onClose: () => void }) {
  const [key, setKey]       = useState(localStorage.getItem('panel_gemini_key') || '');
  const [visible, setVisible] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const guardar = () => {
    if (key.trim()) localStorage.setItem('panel_gemini_key', key.trim());
    else localStorage.removeItem('panel_gemini_key');
    setGuardado(true);
    setTimeout(() => { setGuardado(false); onClose(); }, 800);
  };

  const keyActual = localStorage.getItem('panel_gemini_key');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center">
              <Key size={15} className="text-[#ff2d78]" />
            </div>
            <h3 className="font-black text-slate-800 text-base">Configuración IA</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <X size={14} />
          </button>
        </div>

        {keyActual && (
          <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2 mb-4 flex items-center gap-2">
            <CheckCircle size={13} className="text-green-500 flex-shrink-0" />
            <p className="text-xs text-green-700 font-medium">API Key personalizada activa</p>
          </div>
        )}

        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          Pega aquí tu Gemini API Key de <span className="font-bold text-slate-700">Google AI Studio</span>. 
          Si el límite se agota, crea una nueva key gratuita y pégala aquí.
        </p>

        <div className="relative mb-4">
          <input
            type={visible ? 'text' : 'password'}
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="AIza..."
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono pr-10 focus:outline-none focus:border-[#ff2d78] focus:ring-1 focus:ring-pink-200"
          />
          <button onClick={() => setVisible(!visible)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"
          className="block text-center text-xs text-[#ff2d78] font-bold mb-4 hover:underline">
          → Crear nueva API Key gratuita en Google AI Studio
        </a>

        <div className="flex gap-3">
          {keyActual && (
            <button onClick={() => { localStorage.removeItem('panel_gemini_key'); setKey(''); onClose(); }}
              className="flex-1 py-3 rounded-2xl bg-red-50 text-red-500 font-bold text-sm">
              Quitar key
            </button>
          )}
          <button onClick={guardar}
            className="flex-1 py-3 rounded-2xl font-bold text-sm text-white"
            style={{ background: guardado ? '#22c55e' : 'linear-gradient(135deg,#ff2d78,#ff6b9d)' }}>
            {guardado ? '✓ Guardada' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lista principal ─────────────────────────────────────────────
export function PanelPedidos() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [detalle, setDetalle]   = useState<Cliente | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const cargar = useCallback(async () => {
    const data = await api<Cliente[]>('panel_clientes?select=*&order=last_interaction.desc');
    setClientes(Array.isArray(data) ? data : []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 8000);
    return () => clearInterval(t);
  }, []);

  const onBorrar = (id: string) => setClientes(prev => prev.filter(c => c.id !== id));

  if (detalle) {
    const actual = clientes.find(c => c.id === detalle.id) || detalle;
    return <DetallePedido cliente={actual} onVolver={() => setDetalle(null)} onBorrar={onBorrar} />;
  }

  return (
    <div className="pb-28 min-h-screen" style={{ background: 'var(--brand-secondary, #fff0f3)' }}>
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-pink-100 px-4 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <Package size={20} className="text-[#ff2d78]" />
              Panel de Pedidos
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">{clientes.length} conversación{clientes.length !== 1 ? 'es' : ''} activas</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowConfig(true)}
              className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-pink-50 hover:text-[#ff2d78] hover:border-pink-200 transition-colors"
              title="Configurar API Key de Gemini">
              <Settings size={14} />
            </button>
            <button onClick={cargar} className="w-9 h-9 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center text-[#ff2d78]">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {showConfig && <ModalConfigIA onClose={() => setShowConfig(false)} />}

      <div className="px-4 pt-4 space-y-3">
        {cargando ? (
          <div className="flex flex-col items-center py-24 gap-3">
            <div className="w-7 h-7 rounded-full border-[3px] border-[#ff2d78] border-t-transparent animate-spin" />
            <p className="text-sm text-slate-400">Cargando pedidos...</p>
          </div>
        ) : clientes.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-pink-100 shadow-sm mt-6">
            <Package size={40} className="text-pink-200 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold text-sm">Sin conversaciones activas</p>
            <p className="text-slate-400 text-xs mt-1">Los mensajes de WhatsApp aparecerán aquí</p>
          </div>
        ) : (
          clientes.map(c => {
            let resumenObj: ResumenIA | null = null;
            try { if (c.resumen) resumenObj = JSON.parse(c.resumen); } catch {}
            const preview = resumenObj?.pedido || 'Sin resumen aún — toca para generar';
            const tieneResumen = !!resumenObj?.pedido;

            return (
              <button key={c.id} onClick={() => setDetalle(c)}
                className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-pink-200 active:scale-[0.99] transition-all p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 shadow"
                    style={{ background: 'linear-gradient(135deg,#ff2d78,#ff6b9d)' }}>
                    {fmt(c.phone)[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-800 text-sm truncate">{fmt(c.phone)}</p>
                    <p className="text-[10px] text-slate-400">{ago(c.last_interaction)}</p>
                  </div>
                  {tieneResumen
                    ? <CheckCircle size={15} className="text-green-400 flex-shrink-0" />
                    : <Sparkles size={15} className="text-slate-300 flex-shrink-0" />
                  }
                </div>
                {/* Preview del resumen */}
                <p className={`text-xs leading-relaxed truncate ${tieneResumen ? 'text-slate-600' : 'text-slate-400 italic'}`}>
                  {preview}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
