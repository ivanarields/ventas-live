import React, { useState, useEffect, useCallback } from 'react';
import { Users, MessageCircle, ShoppingBag, Smartphone, Banknote, GitMerge, ChevronDown, ChevronUp, RefreshCw, AlertTriangle, CheckCircle2, X, Search } from 'lucide-react';

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  display_name: string;
  phone: string | null;
  cliente_id: number | null;
  store_phone: string | null;
  panel_phone: string | null;
  confidence: number;
  origin: 'auto' | 'manual';
  merged_from: string[] | null;
  updated_at: string;
}

interface Evidence {
  id: string;
  source: 'manual_payment' | 'macrodroid' | 'whatsapp' | 'store_order';
  event_type: string;
  amount: number | null;
  name_raw: string | null;
  phone: string | null;
  event_at: string;
  profile_id: string;
}

interface Stats {
  total_profiles: number;
  low_confidence: number;
  multi_channel: number;
  evidence_by_source: Record<string, number>;
  total_evidence: number;
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const session = JSON.parse(localStorage.getItem('sb_session') || '{}');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
    ...(session.user?.id ? { 'x-user-id': session.user.id } : {}),
  };
  const res = await fetch(path, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ── Source icons / labels ──────────────────────────────────────────────────────

const SOURCE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  manual_payment: { icon: <Banknote size={11} />, label: 'Manual', color: '#6366f1' },
  macrodroid:     { icon: <Smartphone size={11} />, label: 'MacroDroid', color: '#f59e0b' },
  whatsapp:       { icon: <MessageCircle size={11} />, label: 'WhatsApp', color: '#22c55e' },
  store_order:    { icon: <ShoppingBag size={11} />, label: 'Tienda', color: '#3b82f6' },
};

function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source] ?? { icon: null, label: source, color: '#9ca3af' };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
      style={{ background: meta.color }}>
      {meta.icon}{meta.label}
    </span>
  );
}

function ConfidenceDot({ value }: { value: number }) {
  const color = value >= 0.85 ? '#22c55e' : value >= 0.7 ? '#f59e0b' : '#ef4444';
  const label = value >= 0.85 ? 'Alto' : value >= 0.7 ? 'Medio' : 'Bajo';
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold" style={{ color }}>
      <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
      {label}
    </span>
  );
}

function OriginBadge({ origin }: { origin: 'auto' | 'manual' }) {
  if (origin === 'manual') {
    return (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-extrabold"
        title="Ingresado manualmente por el operador"
      >
        M
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-50 text-yellow-500 text-[11px]"
      title="Detectado automáticamente por el Pulpo"
    >
      ⭐
    </span>
  );
}

// ── Merge Modal ───────────────────────────────────────────────────────────────

function MergeModal({ profile, profiles, onMerge, onClose }: {
  profile: Profile;
  profiles: Profile[];
  onMerge: (targetId: string, sourceId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const candidates = profiles.filter(p =>
    p.id !== profile.id &&
    (p.display_name.toLowerCase().includes(search.toLowerCase()) || (p.phone ?? '').includes(search))
  );

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="bg-white rounded-[24px] p-5 max-w-sm w-full relative z-10 shadow-2xl space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-extrabold text-base-text text-sm">Fusionar con...</h3>
            <p className="text-xs text-gray-400 mt-0.5">"{profile.display_name}" absorberá la evidencia del perfil elegido</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <input
          type="text" placeholder="Buscar perfil..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs outline-none focus:border-brand"
        />
        <div className="space-y-2 max-h-52 overflow-y-auto">
          {candidates.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Sin resultados</p>}
          {candidates.map(c => (
            <button key={c.id} disabled={loading}
              onClick={async () => {
                setLoading(true);
                await onMerge(profile.id, c.id);
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-100 hover:border-brand hover:bg-brand/5 text-left transition-all"
            >
              <div>
                <p className="text-xs font-bold text-base-text">{c.display_name}</p>
                <p className="text-[10px] text-gray-400">{c.phone ?? 'Sin teléfono'}</p>
              </div>
              <ConfidenceDot value={c.confidence} />
            </button>
          ))}
        </div>
        {loading && <p className="text-xs text-center text-brand font-bold">Fusionando...</p>}
      </div>
    </div>
  );
}

// ── Profile Card ──────────────────────────────────────────────────────────────

function ProfileCard({ profile, allProfiles, onMerge, onRefresh }: {
  profile: Profile;
  allProfiles: Profile[];
  onMerge: (targetId: string, sourceId: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loadingEv, setLoadingEv] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  const loadEvidence = useCallback(async () => {
    if (evidence.length > 0) return;
    setLoadingEv(true);
    try {
      const data = await apiFetch(`/api/identity/profiles/${profile.id}`);
      setEvidence(data.evidence ?? []);
    } catch { /* silent */ }
    setLoadingEv(false);
  }, [profile.id, evidence.length]);

  useEffect(() => { if (open) loadEvidence(); }, [open, loadEvidence]);

  const sources = new Set(evidence.map(e => e.source));
  const isLowConfidence = profile.confidence < 0.7;

  return (
    <>
      <div className={`rounded-[18px] border transition-all ${isLowConfidence ? 'border-orange-200 bg-orange-50/40' : 'border-gray-100 bg-white'}`}>
        {/* Header */}
        <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
          onClick={() => setOpen(v => !v)}>
          <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-extrabold text-brand">
              {profile.display_name.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-base-text truncate">{profile.display_name}</p>
            <p className="text-[10px] text-gray-400 truncate">{profile.phone ?? 'Sin teléfono'}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <OriginBadge origin={profile.origin ?? 'auto'} />
            <ConfidenceDot value={profile.confidence} />
            {isLowConfidence && <AlertTriangle size={13} className="text-orange-400" />}
            {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          </div>
        </button>

        {/* Expanded */}
        {open && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
            {/* Canales vinculados */}
            <div className="flex flex-wrap gap-1.5">
              {profile.cliente_id && <SourceBadge source="manual_payment" />}
              {profile.panel_phone && <SourceBadge source="whatsapp" />}
              {profile.store_phone && <SourceBadge source="store_order" />}
              {!profile.cliente_id && !profile.panel_phone && !profile.store_phone && (
                <span className="text-[10px] text-gray-400">Sin canales vinculados</span>
              )}
            </div>

            {/* Evidencia */}
            {loadingEv && <p className="text-xs text-gray-400">Cargando evidencia...</p>}
            {evidence.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Evidencia ({evidence.length})</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {evidence.slice(0, 10).map(e => (
                    <div key={e.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-xl">
                      <SourceBadge source={e.source} />
                      <span className="text-[10px] text-gray-600 truncate flex-1">{e.name_raw ?? e.phone ?? '—'}</span>
                      {e.amount != null && (
                        <span className="text-[10px] font-bold text-green-600">Bs {e.amount}</span>
                      )}
                      <span className="text-[10px] text-gray-400 flex-shrink-0">
                        {new Date(e.event_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                  ))}
                  {evidence.length > 10 && (
                    <p className="text-[10px] text-gray-400 text-center">+{evidence.length - 10} más</p>
                  )}
                </div>
              </div>
            )}

            {/* Acciones */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowMerge(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-[11px] font-bold hover:bg-indigo-100 transition-colors"
              >
                <GitMerge size={12} /> Fusionar
              </button>
              {profile.merged_from && profile.merged_from.length > 0 && (
                <span className="flex items-center gap-1 px-3 py-2 rounded-xl bg-green-50 text-green-600 text-[11px] font-bold">
                  <CheckCircle2 size={12} /> {profile.merged_from.length} fusionado{profile.merged_from.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {showMerge && (
        <MergeModal
          profile={profile}
          profiles={allProfiles}
          onMerge={async (targetId, sourceId) => {
            await onMerge(targetId, sourceId);
            onRefresh();
          }}
          onClose={() => setShowMerge(false)}
        />
      )}
    </>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function IdentityPanel({ userId }: { userId: string }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  const loadAll = useCallback(async (src?: string | null) => {
    setLoading(true);
    try {
      const sourceParam = src ? `&source=${src}` : '';
      const [profilesData, statsData] = await Promise.all([
        apiFetch(`/api/identity/profiles?limit=200${sourceParam}`),
        apiFetch('/api/identity/stats'),
      ]);
      setProfiles(profilesData);
      setStats(statsData);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(sourceFilter); }, [loadAll, sourceFilter]);

  const runSync = async (type: 'pagos' | 'store' | 'whatsapp') => {
    setSyncing(type);
    try {
      const result = await apiFetch(`/api/identity/sync-${type}`, { method: 'POST' });
      await loadAll();
      alert(`Sync ${type}: ${result.created} nuevos, ${result.skipped} ya existían`);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
    setSyncing(null);
  };

  const runRecalculate = async () => {
    setSyncing('recalculate' as any);
    try {
      const result = await apiFetch('/api/identity/recalculate-confidence', { method: 'POST' });
      await loadAll();
      alert(`Confianza recalculada: ${result.updated} perfiles actualizados`);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
    setSyncing(null);
  };

  const handleMerge = async (targetId: string, sourceId: string) => {
    await apiFetch(`/api/identity/profiles/${targetId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ source_id: sourceId }),
    });
  };

  const displayed = profiles.filter(p => {
    if (filter === 'low' && p.confidence >= 0.7) return false;
    if (search && !p.display_name.toLowerCase().includes(search.toLowerCase()) &&
        !(p.phone ?? '').includes(search)) return false;
    return true;
  });

  return (
    <div className="space-y-4">

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Perfiles', value: stats.total_profiles, icon: <Users size={14} />, color: '#ff2d78' },
            { label: 'Evidencias', value: stats.total_evidence, icon: <CheckCircle2 size={14} />, color: '#6366f1' },
            { label: 'Multi-canal', value: stats.multi_channel, icon: <GitMerge size={14} />, color: '#22c55e' },
            { label: 'Confianza baja', value: stats.low_confidence, icon: <AlertTriangle size={14} />, color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-[16px] px-4 py-3 border border-gray-100 flex items-center gap-3">
              <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: s.color + '18', color: s.color }}>
                {s.icon}
              </span>
              <div>
                <p className="text-lg font-extrabold text-base-text leading-none">{s.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Evidencia por fuente */}
      {stats && (
        <div className="bg-white rounded-[16px] px-4 py-3 border border-gray-100 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Evidencia por canal</p>
            {sourceFilter && (
              <button
                onClick={() => setSourceFilter(null)}
                className="text-[10px] text-brand font-bold hover:underline"
              >
                Ver todos
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.evidence_by_source).map(([source, count]) => {
              const isActive = sourceFilter === source;
              return (
                <button
                  key={source}
                  onClick={() => setSourceFilter(isActive ? null : source)}
                  className={`flex items-center gap-1.5 rounded-full transition-all ${isActive ? 'ring-2 ring-offset-1 ring-brand scale-105' : 'opacity-70 hover:opacity-100'}`}
                >
                  <SourceBadge source={source} />
                  <span className="text-xs font-bold text-base-text pr-1">{count}</span>
                </button>
              );
            })}
          </div>
          {sourceFilter && (
            <p className="text-[10px] text-brand font-bold">
              Mostrando solo perfiles con evidencia de: {SOURCE_META[sourceFilter]?.label ?? sourceFilter}
            </p>
          )}
        </div>
      )}

      {/* Sync buttons */}
      <div className="bg-white rounded-[16px] px-4 py-3 border border-gray-100 space-y-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Sincronizar datos</p>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'pagos', label: 'Pagos', icon: <Banknote size={11} /> },
            { key: 'store', label: 'Tienda', icon: <ShoppingBag size={11} /> },
            { key: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={11} /> },
          ].map(s => (
            <button key={s.key}
              disabled={!!syncing}
              onClick={() => runSync(s.key as any)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-colors"
              style={{ background: syncing === s.key ? '#f3f4f6' : '#f9fafb', color: syncing === s.key ? '#9ca3af' : '#374151' }}
            >
              {syncing === s.key ? <RefreshCw size={11} className="animate-spin" /> : s.icon}
              {s.label}
            </button>
          ))}
          <button
            disabled={!!syncing}
            onClick={runRecalculate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-colors"
            style={{ background: syncing === 'recalculate' ? '#f3f4f6' : '#fdf4ff', color: syncing === 'recalculate' ? '#9ca3af' : '#a855f7' }}
          >
            {syncing === 'recalculate' ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Recalcular confianza
          </button>
        </div>
      </div>

      {/* Filter + search */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar perfil..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-gray-200 text-xs outline-none focus:border-brand bg-white"
          />
        </div>
        <button onClick={() => setFilter(f => f === 'all' ? 'low' : 'all')}
          className="px-3 py-2 rounded-xl text-[11px] font-bold transition-colors flex items-center gap-1.5"
          style={{ background: filter === 'low' ? '#fff7ed' : '#f9fafb', color: filter === 'low' ? '#f59e0b' : '#6b7280' }}
        >
          <AlertTriangle size={11} />
          {filter === 'low' ? 'Solo baja confianza' : 'Todos'}
        </button>
      </div>

      {/* Profile list */}
      {loading ? (
        <div className="text-center py-8 text-sm text-gray-400">Cargando perfiles...</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">Sin resultados</div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-400 px-1">{displayed.length} perfiles</p>
          {displayed.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              allProfiles={profiles}
              onMerge={handleMerge}
              onRefresh={loadAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}
