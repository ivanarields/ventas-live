import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  FileText,
  Key,
  Loader2,
  Images,
  RefreshCw,
  XCircle,
  Zap,
} from 'lucide-react';

const BRAND = 'rgba(255, 45, 120, 0.5)';
const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';

type FeatureConfig = Record<string, { enabled: boolean; model: string }>;

interface AiConfig {
  provider: 'openrouter';
  openrouter?: {
    masked: string;
    active: boolean;
    model: string;
    active_model?: string;
    source: 'env' | 'db' | 'none';
  };
  owner_name: string;
  features: FeatureConfig;
}

interface UsageData {
  total: number;
  today: number;
  errors: number;
  byFeature: Record<string, number>;
  log: Array<{
    feature: string;
    model?: string;
    success: boolean;
    latency_ms: number;
    created_at: string;
    error_message: string | null;
  }>;
}

const FEATURE_META: Record<string, { icon: React.ReactNode; label: string; desc: string }> = {
  product_vision: {
    icon: <Camera size={14} />,
    label: 'Catalogar productos',
    desc: 'Analiza fotos de ropa y genera datos del producto.',
  },
  photo_selection: {
    icon: <Images size={14} />,
    label: 'Selección automática de prendas',
    desc: 'Marca las fotos del chat que parecen prendas compradas.',
  },
  notif_parser: {
    icon: <CreditCard size={14} />,
    label: 'Parser notificaciones',
    desc: 'Extrae nombres y montos de notificaciones bancarias.',
  },
};

function defaultFeatures(model: string): FeatureConfig {
  return {
    product_vision: { enabled: true, model },
    photo_selection: { enabled: false, model },
    notif_parser: { enabled: true, model },
  };
}

export function AiSettingsPanel({ userId }: { userId: string }) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modelInput, setModelInput] = useState(DEFAULT_MODEL);
  const [ownerName, setOwnerName] = useState('');
  const [savingOwner, setSavingOwner] = useState(false);
  const [ownerMsg, setOwnerMsg] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [promptMsg, setPromptMsg] = useState('');
  const [comprobanteMode, setComprobanteMode] = useState<'simple' | 'completo'>('simple');
  const [savingMode, setSavingMode] = useState(false);
  const [savingFeature, setSavingFeature] = useState<string | null>(null);
  const [featureMsg, setFeatureMsg] = useState('');

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [cRes, uRes, pRes] = await Promise.all([
        fetch('/api/ai/config', { headers: { 'x-user-id': userId } }),
        fetch('/api/ai/usage?days=7', { headers: { 'x-user-id': userId } }),
        fetch('/api/ai/prompts', { headers: { 'x-user-id': userId } }),
      ]);

      if (cRes.ok) {
        const cfg = await cRes.json();
        setConfig(cfg);
        setModelInput(cfg.openrouter?.active_model || cfg.openrouter?.model || DEFAULT_MODEL);
        setOwnerName(cfg.owner_name ?? '');
      }
      if (uRes.ok) setUsage(await uRes.json());
      if (pRes.ok) {
        const pd = await pRes.json();
        setComprobanteMode((pd.prompts?.comprobante_mode as any)?.text === 'completo' ? 'completo' : 'simple');
      }
    } catch (e) {
      console.error('[ai-settings] Error cargando:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfig(); }, []);

  const normalizedFeatures = () => {
    const base = config?.features ?? defaultFeatures(modelInput || DEFAULT_MODEL);
    const next: FeatureConfig = {};
    for (const key of Object.keys(FEATURE_META)) {
      next[key] = {
        enabled: base[key]?.enabled !== false,
        model: modelInput.trim() || DEFAULT_MODEL,
      };
    }
    return next;
  };

  const saveOwnerName = async () => {
    setSavingOwner(true);
    setOwnerMsg('');
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ ownerName: ownerName.trim() || null, features: normalizedFeatures() }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      setOwnerMsg('Guardado');
    } catch {
      setOwnerMsg('Error al guardar');
    } finally {
      setSavingOwner(false);
      setTimeout(() => setOwnerMsg(''), 3000);
    }
  };

  const toggleFeature = async (feature: string) => {
    if (!config) return;
    if (savingFeature) return;
    const prev = config.features ?? defaultFeatures(modelInput || DEFAULT_MODEL);
    const next = normalizedFeatures();
    next[feature] = { ...next[feature], enabled: !next[feature].enabled };
    setConfig({ ...config, features: next });
    setSavingFeature(feature);
    setFeatureMsg('');
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ features: next }),
      });
      if (!res.ok) throw new Error('Error al guardar función IA');
      setFeatureMsg('Funciones IA guardadas');
    } catch {
      setConfig({ ...config, features: prev });
      setFeatureMsg('Error al guardar funciones IA');
    } finally {
      setSavingFeature(null);
      setTimeout(() => setFeatureMsg(''), 2500);
    }
  };

  const saveComprobanteMode = async (mode: 'simple' | 'completo') => {
    setSavingMode(true);
    setComprobanteMode(mode);
    try {
      await fetch('/api/ai/prompts/comprobante_mode', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ text: mode }),
      });
      setPromptMsg(`Prompt ${mode === 'simple' ? 'simple' : 'completo'} activado`);
    } catch {
      setPromptMsg('Error al guardar modo');
    } finally {
      setSavingMode(false);
      setTimeout(() => setPromptMsg(''), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  const active = !!config?.openrouter?.active;
  const sourceLabel = config?.openrouter?.source === 'env' ? '.env' : config?.openrouter?.source === 'db' ? 'guardada' : 'sin key';

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
          style={{ background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.5), rgba(236, 72, 153, 0.5))' }}>
          <Zap size={18} className="text-white" />
        </div>
        <div>
          <h3 className="text-lg font-black text-gray-900">Inteligencia Artificial</h3>
          <p className="text-[10px] text-gray-400 font-medium">Proveedor único: OpenRouter</p>
        </div>
      </div>

      <div className="card-modern p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key size={13} style={{ color: BRAND }} />
            <span className="text-sm font-black text-gray-800">Modelo activo</span>
          </div>
          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
            {active ? 'conectado' : 'sin configurar'}
          </span>
        </div>
        <p className="text-[11px] font-mono text-purple-700 bg-purple-50 rounded-lg px-3 py-2">
          {modelInput}
        </p>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-gray-600 uppercase tracking-wide">Nombre completo de la dueña</label>
          <input
            type="text"
            placeholder="Ej: LEIDY CANDY DIAZ SANCHEZ"
            value={ownerName}
            onChange={e => setOwnerName(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[11px] font-mono outline-none focus:border-[#ff2d78]/60 focus:ring-2 focus:ring-[#ff2d78]/10 h-9 uppercase"
          />
        </div>
        <button onClick={saveOwnerName} disabled={savingOwner}
          className="w-full h-10 rounded-full font-black text-[11px] text-white disabled:opacity-40 bg-gradient-to-r from-[#ff2d78] to-[#ff6fa3] shadow-md hover:opacity-95 transition-all active:scale-95">
          {savingOwner ? 'Guardando...' : 'Guardar nombre'}
        </button>
        {ownerMsg && <span className="text-[11px] font-bold text-gray-600">{ownerMsg}</span>}
      </div>

      <div className="card-modern p-4 space-y-3">
        <h4 className="text-sm font-black text-gray-800 flex items-center gap-2">
          <Zap size={14} style={{ color: BRAND }} /> Funciones de IA
        </h4>

        {Object.entries(FEATURE_META).map(([key, meta]) => {
          const feat = config?.features?.[key] ?? { enabled: true, model: modelInput || DEFAULT_MODEL };
          const count = usage?.byFeature?.[key] ?? 0;
          return (
            <div key={key}
              className="flex items-center gap-3 p-3 rounded-2xl border transition-all"
              style={{ borderColor: feat.enabled ? 'rgba(255, 45, 120, 0.1)' : 'rgba(255,255,255,0.2)', background: feat.enabled ? 'rgba(255, 45, 120, 0.025)' : 'rgba(255,255,255,0.4)' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-xs"
                style={{ background: feat.enabled ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.5), rgba(236, 72, 153, 0.5))' : '#e5e7eb' }}>
                <span className={feat.enabled ? 'text-white' : 'text-gray-400'}>{meta.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-black text-gray-800">{meta.label}</p>
                <p className="text-[10px] text-gray-400 leading-tight">{meta.desc}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] font-bold text-gray-500 bg-white/70 border border-white/50 px-1.5 py-0.5 rounded-full truncate max-w-[150px]">
                    {modelInput || DEFAULT_MODEL}
                  </span>
                  {count > 0 && <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">{count} llamadas</span>}
                </div>
              </div>
              <button onClick={() => toggleFeature(key)} className="flex-shrink-0" disabled={savingFeature === key}>
                <div className="w-10 h-5 rounded-full transition-all flex items-center px-0.5" style={{ background: feat.enabled ? 'rgba(255, 45, 120, 0.5)' : '#d1d5db' }}>
                  <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all" style={{ transform: feat.enabled ? 'translateX(20px)' : 'translateX(0)' }} />
                </div>
              </button>
            </div>
          );
        })}
        {featureMsg && <p className="text-[11px] font-bold text-center text-gray-600">{featureMsg}</p>}
      </div>

      <div className="card-modern p-4 space-y-3">
        <h4 className="text-sm font-black text-gray-800 flex items-center gap-2">
          <FileText size={14} style={{ color: BRAND }} /> Prompts de comprobantes
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => saveComprobanteMode('simple')} disabled={savingMode}
            className="p-3 rounded-xl border-2 text-left transition-all disabled:opacity-50"
            style={{ borderColor: comprobanteMode === 'simple' ? '#4a9ff5' : 'rgba(255,255,255,0.3)', background: comprobanteMode === 'simple' ? 'rgba(74,159,245,0.08)' : 'rgba(255,255,255,0.4)' }}>
            <p className="text-[11px] font-black text-gray-800">Prompt simple</p>
            <p className="text-[9px] text-gray-500 leading-tight mt-1">Directo y eficiente.</p>
          </button>
          <button onClick={() => saveComprobanteMode('completo')} disabled={savingMode}
            className="p-3 rounded-xl border-2 text-left transition-all disabled:opacity-50"
            style={{ borderColor: comprobanteMode === 'completo' ? '#a855f7' : 'rgba(255,255,255,0.3)', background: comprobanteMode === 'completo' ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.4)' }}>
            <p className="text-[11px] font-black text-gray-800">Prompt completo</p>
            <p className="text-[9px] text-gray-500 leading-tight mt-1">Mas robusto en casos dificiles.</p>
          </button>
        </div>
        {promptMsg && <p className="text-[11px] font-bold text-center text-gray-600">{promptMsg}</p>}
      </div>

      <div className="card-modern p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-black text-gray-800 flex items-center gap-2">
            <BarChart3 size={14} style={{ color: BRAND }} /> Uso de IA
          </h4>
          <button onClick={loadConfig} className="text-gray-400 hover:text-gray-600"><RefreshCw size={14} /></button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100/40 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-purple-600">{usage?.total ?? 0}</p>
            <p className="text-[9px] font-black text-gray-400 uppercase">7 dias</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100/40 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-blue-600">{usage?.today ?? 0}</p>
            <p className="text-[9px] font-black text-gray-400 uppercase">Hoy</p>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-100/40 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-red-500">{usage?.errors ?? 0}</p>
            <p className="text-[9px] font-black text-gray-400 uppercase">Errores</p>
          </div>
        </div>

        <button onClick={() => setShowLog(v => !v)} className="w-full flex items-center justify-between py-2 text-[11px] font-black text-gray-500">
          <span>Log reciente ({usage?.log?.length ?? 0} llamadas)</span>
          {showLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showLog && (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {(usage?.log ?? []).slice(0, 20).map((entry, i) => {
              const meta = FEATURE_META[entry.feature];
              const time = new Date(entry.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/50 border border-white/10 text-[10px]">
                  {entry.success ? <CheckCircle2 size={12} className="text-[#10b981] flex-shrink-0" /> : <XCircle size={12} className="text-red-500 flex-shrink-0" />}
                  <span className="text-gray-400 font-mono w-10 flex-shrink-0">{time}</span>
                  <span className="font-bold text-gray-600 truncate flex-1">{meta?.label ?? entry.feature}</span>
                  <span className="text-gray-400 font-mono">{entry.latency_ms}ms</span>
                  {entry.error_message && <span className="text-red-400 truncate max-w-[160px]" title={entry.error_message}>{entry.error_message}</span>}
                </div>
              );
            })}
            {(usage?.log ?? []).length === 0 && <p className="text-center text-[10px] text-gray-400 py-4">Sin llamadas registradas aun</p>}
          </div>
        )}
      </div>
    </div>
  );
}
