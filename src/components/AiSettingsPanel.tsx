import React, { useState, useEffect } from 'react';
import {
  Key, Eye, EyeOff, CheckCircle2, XCircle, RefreshCw,
  Zap, Camera, MessageSquare, CreditCard, Loader2,
  ChevronDown, ChevronUp, BarChart3, Plus, Trash2, FileText,
} from 'lucide-react';

const BRAND = '#ff2d78';

interface KeySlot {
  slot: number;
  masked: string;
  active: boolean;
}

interface AiConfig {
  keys: KeySlot[];
  // legacy compat
  primary_key: string;
  has_primary: boolean;
  fallback_key: string;
  has_fallback: boolean;
  owner_name: string;
  features: Record<string, { enabled: boolean; model: string }>;
  daily_limit: number;
  source: 'env' | 'db';
}

interface UsageData {
  total: number;
  today: number;
  errors: number;
  byFeature: Record<string, number>;
  log: Array<{
    feature: string;
    success: boolean;
    latency_ms: number;
    created_at: string;
    error_message: string | null;
  }>;
}

const FEATURE_META: Record<string, { icon: React.ReactNode; label: string; desc: string }> = {
  product_vision: {
    icon: <Camera size={14} />,
    label: 'Catalogar Productos',
    desc: 'Analiza fotos de ropa y genera nombre, categoría, talla',
  },
  chat_summary: {
    icon: <MessageSquare size={14} />,
    label: 'Resumen WhatsApp',
    desc: 'Resume conversaciones: texto, audios, fotos y comprobantes de pago',
  },
  notif_parser: {
    icon: <CreditCard size={14} />,
    label: 'Parser Notificaciones',
    desc: 'Extrae nombres y montos de notificaciones bancarias',
  },
};

const SLOT_LABELS = ['Key 1 (Principal)', 'Key 2', 'Key 3', 'Key 4', 'Key 5'];

export function AiSettingsPanel({ userId }: { userId: string }) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  // 5 inputs para las 5 keys
  const [keyInputs, setKeyInputs] = useState<string[]>(['', '', '', '', '']);
  const [showKey, setShowKey] = useState<boolean[]>([false, false, false, false, false]);
  const [testingSlot, setTestingSlot] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Array<{ ok: boolean; msg: string } | null>>([null, null, null, null, null]);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [promptMsg, setPromptMsg] = useState('');
  const [comprobanteMode, setComprobanteMode] = useState<'simple' | 'completo'>('simple');
  const [savingMode, setSavingMode] = useState(false);

  const loadConfig = async () => {
    try {
      const [cRes, uRes, pRes] = await Promise.all([
        fetch('/api/ai/config', { headers: { 'x-user-id': userId } }),
        fetch('/api/ai/usage?days=7', { headers: { 'x-user-id': userId } }),
        fetch('/api/ai/prompts', { headers: { 'x-user-id': userId } }),
      ]);
      if (cRes.ok) {
        const cfg = await cRes.json();
        setConfig(cfg);
        if (cfg.owner_name) setOwnerName(cfg.owner_name);
      }
      if (uRes.ok) setUsage(await uRes.json());
      if (pRes.ok) {
        const pd = await pRes.json();
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(pd.prompts ?? {})) {
          mapped[k] = (v as any).text ?? '';
        }
        setPrompts(mapped);
        const mode = (pd.prompts?.comprobante_mode as any)?.text;
        if (mode === 'completo') setComprobanteMode('completo');
        else setComprobanteMode('simple');
      }
    } catch (e) { console.error('[ai-settings] Error cargando:', e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadConfig(); }, []);

  const setInput = (i: number, val: string) => {
    const next = [...keyInputs];
    next[i] = val;
    setKeyInputs(next);
  };

  const toggleShow = (i: number) => {
    const next = [...showKey];
    next[i] = !next[i];
    setShowKey(next);
  };

  const testKey = async (slotIndex: number) => {
    const key = keyInputs[slotIndex];
    if (!key.trim()) return;
    setTestingSlot(slotIndex);
    const next = [...testResults];
    next[slotIndex] = null;
    setTestResults(next);
    try {
      const res = await fetch('/api/ai/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key.trim() }),
      });
      const data = await res.json();
      const next2 = [...testResults];
      next2[slotIndex] = { ok: data.ok, msg: data.message };
      setTestResults(next2);
    } catch {
      const next2 = [...testResults];
      next2[slotIndex] = { ok: false, msg: '❌ Error de conexión' };
      setTestResults(next2);
    }
    finally { setTestingSlot(null); }
  };

  const saveKeys = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const body: any = { keys: keyInputs.map(k => k.trim() || undefined) };
      if (config?.features) body.features = config.features;
      // Incluir el nombre de la dueña si fue modificado
      body.ownerName = ownerName.trim() || null;

      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSaveMsg('✅ Guardado');
        setKeyInputs(['', '', '', '', '']);
        await loadConfig();
      } else {
        const err = await res.json();
        setSaveMsg(`❌ ${err.error || 'Error al guardar'}`);
      }
    } catch { setSaveMsg('❌ Error de conexión'); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(''), 4000); }
  };

  const toggleFeature = (feature: string) => {
    if (!config) return;
    const updated = { ...config.features };
    updated[feature] = { ...updated[feature], enabled: !updated[feature].enabled };
    setConfig({ ...config, features: updated });
  };

  const saveFeatures = async () => {
    if (!config?.features) return;
    setSaving(true);
    try {
      await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ features: config.features }),
      });
    } finally { setSaving(false); }
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
      setPromptMsg(`✅ Prompt ${mode === 'simple' ? 'Simple' : 'Completo'} activado`);
    } catch { setPromptMsg('❌ Error al guardar modo'); }
    finally { setSavingMode(false); setTimeout(() => setPromptMsg(''), 3000); }
  };

  const savePrompt = async (key: string) => {
    setSavingPrompt(true);
    setPromptMsg('');
    try {
      const res = await fetch(`/api/ai/prompts/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ text: prompts[key] ?? '' }),
      });
      if (res.ok) {
        setPromptMsg('✅ Prompt guardado');
      } else {
        const err = await res.json();
        setPromptMsg(`❌ ${err.error || 'Error al guardar'}`);
      }
    } catch { setPromptMsg('❌ Error de conexión'); }
    finally { setSavingPrompt(false); setTimeout(() => setPromptMsg(''), 4000); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  const usagePercent = usage && config
    ? Math.min(100, Math.round((usage.today / (config.daily_limit * 5)) * 100))
    : 0;

  const PREVIEW_SIMPLE = `La dueña del negocio es: [NOMBRE DE LA DUEÑA]
Ella SIEMPRE recibe el dinero. Nunca lo envía.

Tu tarea: identificar al CLIENTE que envió el dinero, el MONTO y la HORA.

REGLA — El cliente debe ser una persona real:
Escribe null si ves: tipo de cuenta (Caja de Ahorros, Cuenta Corriente), nombre
de banco, número de teléfono, email, o si el pagador es la dueña.

Un nombre válido tiene nombre + apellido: "JUAN MAMANI", "ANA GARCIA".
Extrae exactamente como aparece, en MAYÚSCULAS.

{"cliente": "NOMBRE EN MAYÚSCULAS o null", "monto": número, "hora": "HH:MM"}`;

  const PREVIEW_COMPLETO = `5 pasos de verificación:

PASO 1 — ¿Es comprobante? (Yape, QR, transferencia, Yolo, ZAS...)
PASO 2 — ¿Quién RECIBIÓ? (receptor = la dueña del negocio)
PASO 3 — ¿Quién ENVIÓ? (pagador = el cliente)
  ⚠ Regla: el pagador debe ser persona real con nombre+apellido.
  Palabras prohibidas: CAJA · AHORROS · BANCO · CUENTA · QR · TIGO
  · COOPERATIVA · BILLETERA · número de teléfono · email
  Cooperativas sin nombre: → pagador = null (es normal)
PASO 4 — Monto (número puro) y hora (HH:MM)
PASO 5 — Autoverificación antes de responder

{"es_comprobante":true, "pagador":"NOMBRE o null",
 "receptor":"NOMBRE o null", "monto":150, "hora":"14:30",
 "es_transferencia_propia":false}`;

  // Construir el estado de los 5 slots desde la respuesta del servidor
  const serverKeys: KeySlot[] = config?.keys ?? [
    { slot: 1, masked: config?.primary_key ?? '', active: config?.has_primary ?? false },
    { slot: 2, masked: config?.fallback_key ?? '', active: config?.has_fallback ?? false },
    { slot: 3, masked: '', active: false },
    { slot: 4, masked: '', active: false },
    { slot: 5, masked: '', active: false },
  ];

  const totalActive = serverKeys.filter(k => k.active).length;
  const dailyCapacity = totalActive * 1500;

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>
          <Zap size={18} className="text-white" />
        </div>
        <div>
          <h3 className="text-lg font-black text-gray-900">Inteligencia Artificial</h3>
          <p className="text-[10px] text-gray-400 font-medium">Gestiona tus API Keys y funciones de IA</p>
        </div>
      </div>

      {/* ═══ Perfil del negocio ═══ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            <span className="text-white text-xs font-black">👤</span>
          </div>
          <div>
            <h4 className="text-sm font-black text-gray-800">Perfil del Negocio</h4>
            <p className="text-[9px] text-gray-400">Nombre de la administradora — se usa para identificar quién recibe los pagos en los comprobantes</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-gray-600 uppercase tracking-wide">
            Nombre completo de la dueña
          </label>
          <input
            type="text"
            placeholder="Ej: LEIDY CANDY DIAZ SANCHEZ"
            value={ownerName}
            onChange={e => setOwnerName(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[11px] font-mono outline-none focus:border-purple-400 h-9 uppercase"
          />
          <p className="text-[9px] text-gray-400 leading-tight">
            La IA usará este nombre para saber quién es la receptora en los comprobantes de Yape, QR y transferencias.
            Si un comprobante muestra este nombre como pagadora (caso excepcional), también lo detecta correctamente.
          </p>
        </div>

        <button
          onClick={saveKeys}
          disabled={saving}
          className="w-full h-9 rounded-xl font-black text-[11px] text-white disabled:opacity-40 transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          {saving ? 'Guardando...' : '💾 Guardar perfil'}
        </button>
        {saveMsg && <span className="text-[11px] font-bold">{saveMsg}</span>}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
        {/* Cabecera sección */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Key size={13} style={{ color: BRAND }} />
            <h4 className="text-sm font-black text-gray-800">API Keys de Gemini</h4>
          </div>
          <div className="flex items-center gap-1.5">
            {totalActive > 0 && (
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full text-white"
                style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
                {totalActive} activa{totalActive !== 1 ? 's' : ''} · {(dailyCapacity).toLocaleString()}/día
              </span>
            )}
            {config?.source === 'env' && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                .env
              </span>
            )}
          </div>
        </div>

        {/* Explicación mini */}
        <p className="text-[9px] text-gray-400 leading-tight mb-2">
          Rota automáticamente. Si una se agota (429), pasa a la siguiente sin interrupciones.
          Cada key gratuita da 1,500 llamadas/día → 5 keys = 7,500/día.
        </p>

        {/* 5 filas compactas */}
        {SLOT_LABELS.map((label, i) => {
          const slot = serverKeys[i];
          const isActive = slot?.active;
          const inputVal = keyInputs[i];
          const result = testResults[i];

          return (
            <div key={i} className="flex items-center gap-1.5 h-9">
              {/* Indicador estado */}
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-green-400' : 'bg-gray-200'}`} />

              {/* Label */}
              <span className="text-[10px] font-black text-gray-500 w-20 flex-shrink-0">
                {label}
              </span>

              {/* Valor actual o input */}
              {isActive && !inputVal ? (
                <span className="flex-1 text-[10px] font-mono text-gray-400 bg-gray-50 rounded-lg px-2 py-1.5 truncate">
                  {slot.masked}
                </span>
              ) : (
                <div className="flex-1 relative">
                  <input
                    type={showKey[i] ? 'text' : 'password'}
                    placeholder={isActive ? `${slot.masked} (nueva)` : 'AIza...'}
                    value={inputVal}
                    onChange={e => setInput(i, e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-[10px] font-mono outline-none focus:border-pink-400 pr-6 h-8"
                  />
                  <button onClick={() => toggleShow(i)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                    {showKey[i] ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                </div>
              )}

              {/* Botón editar (si activa y sin input) */}
              {isActive && !inputVal && (
                <button onClick={() => setInput(i, ' ')}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-400 flex-shrink-0">
                  <Plus size={11} />
                </button>
              )}

              {/* Botón testear (si hay input) */}
              {inputVal.trim() && (
                <button onClick={() => testKey(i)} disabled={testingSlot === i}
                  className="w-14 h-7 flex items-center justify-center rounded-lg text-[9px] font-black text-white flex-shrink-0 disabled:opacity-40"
                  style={{ background: result?.ok ? '#10b981' : result?.ok === false ? '#ef4444' : 'linear-gradient(135deg,#10b981,#059669)' }}>
                  {testingSlot === i
                    ? <Loader2 size={10} className="animate-spin" />
                    : result?.ok === true ? '✓ OK'
                    : result?.ok === false ? '✗ Falla'
                    : 'Testear'}
                </button>
              )}
            </div>
          );
        })}

        {/* Botón guardar */}
        <div className="flex gap-2 items-center pt-1">
          <button
            onClick={saveKeys}
            disabled={saving || keyInputs.every(k => !k.trim())}
            className="flex-1 h-9 rounded-xl font-black text-[11px] text-white disabled:opacity-40 transition-all active:scale-95"
            style={{ background: `linear-gradient(135deg, ${BRAND}, #ff6fa3)` }}>
            {saving ? 'Guardando...' : '💾 Guardar Keys'}
          </button>
          {saveMsg && <span className="text-[11px] font-bold">{saveMsg}</span>}
        </div>
      </div>

      {/* ═══ Funciones de IA ═══ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <h4 className="text-sm font-black text-gray-800 flex items-center gap-2">
          <Zap size={14} style={{ color: BRAND }} />
          Funciones de IA
        </h4>

        {Object.entries(FEATURE_META).map(([key, meta]) => {
          const feat = config?.features?.[key] ?? { enabled: true, model: 'gemini-2.5-flash-lite' };
          const count = usage?.byFeature?.[key] ?? 0;

          return (
            <div key={key}
              className="flex items-center gap-3 p-3 rounded-xl border transition-all"
              style={{ borderColor: feat.enabled ? '#d1fae5' : '#f3f4f6', background: feat.enabled ? '#f0fdf4' : '#fafafa' }}>

              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: feat.enabled ? 'linear-gradient(135deg, #a855f7, #ec4899)' : '#e5e7eb' }}>
                <span className={feat.enabled ? 'text-white' : 'text-gray-400'}>{meta.icon}</span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-black text-gray-800">{meta.label}</p>
                <p className="text-[10px] text-gray-400 leading-tight">{meta.desc}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                    {feat.model}
                  </span>
                  {count > 0 && (
                    <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">
                      {count} llamadas (7d)
                    </span>
                  )}
                </div>
              </div>

              <button onClick={() => toggleFeature(key)} className="flex-shrink-0">
                <div className="w-10 h-5 rounded-full transition-all flex items-center px-0.5"
                  style={{ background: feat.enabled ? '#10b981' : '#d1d5db' }}>
                  <div className="w-4 h-4 rounded-full bg-white shadow-sm transition-all"
                    style={{ transform: feat.enabled ? 'translateX(20px)' : 'translateX(0)' }} />
                </div>
              </button>
            </div>
          );
        })}

        <button onClick={saveFeatures}
          className="w-full h-9 rounded-xl font-black text-[11px] text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
          Guardar configuración de funciones
        </button>
      </div>

      {/* ═══ Prompts de IA ═══ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <h4 className="text-sm font-black text-gray-800 flex items-center gap-2">
          <FileText size={14} style={{ color: BRAND }} />
          Prompts de IA
        </h4>

        <div className="p-3 rounded-xl border border-gray-100 bg-gray-50 space-y-3">
          <div>
            <p className="text-[12px] font-black text-gray-800">Extracción de Comprobantes de Pago</p>
            <p className="text-[10px] text-gray-400 leading-tight">
              Se activa cuando el cliente manda una foto de comprobante (Yape, QR, transferencia bancaria).
              Seleccioná cuál prompt usar y presioná el botón para activarlo.
            </p>
          </div>

          {/* Switch Simple / Completo */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => saveComprobanteMode('simple')}
              disabled={savingMode}
              className="relative p-3 rounded-xl border-2 text-left transition-all disabled:opacity-50"
              style={{
                borderColor: comprobanteMode === 'simple' ? '#3b82f6' : '#e5e7eb',
                background: comprobanteMode === 'simple' ? '#eff6ff' : '#fafafa',
              }}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: comprobanteMode === 'simple' ? '#3b82f6' : '#d1d5db' }}>
                  {comprobanteMode === 'simple' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  )}
                </div>
                <span className="text-[11px] font-black text-gray-800">Prompt Simple</span>
                {comprobanteMode === 'simple' && (
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full text-white bg-blue-500 ml-auto">
                    ACTIVO
                  </span>
                )}
              </div>
              <p className="text-[9px] text-gray-500 leading-tight pl-4">
                Directo y eficiente. Deja razonar al modelo. Recomendado para empezar.
              </p>
            </button>

            <button
              onClick={() => saveComprobanteMode('completo')}
              disabled={savingMode}
              className="relative p-3 rounded-xl border-2 text-left transition-all disabled:opacity-50"
              style={{
                borderColor: comprobanteMode === 'completo' ? '#a855f7' : '#e5e7eb',
                background: comprobanteMode === 'completo' ? '#faf5ff' : '#fafafa',
              }}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: comprobanteMode === 'completo' ? '#a855f7' : '#d1d5db' }}>
                  {comprobanteMode === 'completo' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  )}
                </div>
                <span className="text-[11px] font-black text-gray-800">Prompt Completo</span>
                {comprobanteMode === 'completo' && (
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full text-white bg-purple-500 ml-auto">
                    ACTIVO
                  </span>
                )}
              </div>
              <p className="text-[9px] text-gray-500 leading-tight pl-4">
                5 pasos, reglas bolivianas, autoverificación. Más robusto en casos difíciles.
              </p>
            </button>
          </div>

          {promptMsg && (
            <p className="text-[11px] font-bold text-center">{promptMsg}</p>
          )}

          {/* Vista previa del prompt activo */}
          <div>
            <p className="text-[10px] font-black text-gray-500 mb-1 uppercase tracking-wide">
              Vista previa — {comprobanteMode === 'simple' ? 'Prompt Simple' : 'Prompt Completo'}
            </p>
            <textarea
              readOnly
              value={comprobanteMode === 'simple' ? PREVIEW_SIMPLE : PREVIEW_COMPLETO}
              rows={9}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[10px] font-mono resize-none leading-relaxed bg-white text-gray-500 outline-none cursor-default"
            />
            <p className="text-[9px] text-gray-400 mt-1">
              Solo es una vista resumida. El prompt real enviado a la IA es más completo.
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Métricas ═══ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-black text-gray-800 flex items-center gap-2">
            <BarChart3 size={14} style={{ color: BRAND }} />
            Uso de IA
          </h4>
          <button onClick={loadConfig} className="text-gray-400 hover:text-gray-600">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-purple-600">{usage?.total ?? 0}</p>
            <p className="text-[9px] font-black text-gray-400 uppercase">7 días</p>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-blue-600">{usage?.today ?? 0}</p>
            <p className="text-[9px] font-black text-gray-400 uppercase">Hoy</p>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-red-500">{usage?.errors ?? 0}</p>
            <p className="text-[9px] font-black text-gray-400 uppercase">Errores</p>
          </div>
        </div>

        {/* Barra de uso — ahora contra capacidad total de todas las keys */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold">
            <span className="text-gray-500">Uso hoy</span>
            <span style={{ color: usagePercent > 80 ? '#ef4444' : usagePercent > 50 ? '#f59e0b' : '#10b981' }}>
              {usage?.today ?? 0} / {dailyCapacity > 0 ? dailyCapacity.toLocaleString() : (config?.daily_limit ?? 1500)} ({usagePercent}%)
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${usagePercent}%`,
                background: usagePercent > 80
                  ? 'linear-gradient(90deg, #ef4444, #f97316)'
                  : usagePercent > 50
                    ? 'linear-gradient(90deg, #f59e0b, #eab308)'
                    : 'linear-gradient(90deg, #10b981, #34d399)',
              }} />
          </div>
          {totalActive > 1 && (
            <p className="text-[9px] text-gray-400">
              {totalActive} keys activas · {totalActive * 15} req/min · {dailyCapacity.toLocaleString()} llamadas/día
            </p>
          )}
        </div>

        {/* Log expandible */}
        <button onClick={() => setShowLog(!showLog)}
          className="w-full flex items-center justify-between py-2 text-[11px] font-black text-gray-500">
          <span>📜 Log reciente ({usage?.log?.length ?? 0} llamadas)</span>
          {showLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showLog && (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {(usage?.log ?? []).slice(0, 20).map((entry, i) => {
              const meta = FEATURE_META[entry.feature];
              const time = new Date(entry.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-gray-50 text-[10px]">
                  {entry.success
                    ? <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                    : <XCircle size={12} className="text-red-500 flex-shrink-0" />}
                  <span className="text-gray-400 font-mono w-10 flex-shrink-0">{time}</span>
                  <span className="font-bold text-gray-600 truncate flex-1">
                    {meta?.label ?? entry.feature}
                  </span>
                  <span className="text-gray-400 font-mono">{entry.latency_ms}ms</span>
                  {entry.error_message && (
                    <span className="text-red-400 truncate max-w-[80px]">{entry.error_message}</span>
                  )}
                </div>
              );
            })}
            {(usage?.log ?? []).length === 0 && (
              <p className="text-center text-[10px] text-gray-400 py-4">Sin llamadas registradas aún</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
