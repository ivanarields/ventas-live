import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AiSettingsPanel } from '../components/AiSettingsPanel';
import { WhatsappConnectionPanel } from '../components/WhatsappConnectionPanel';
import { adminApi, pagosApi, apiFetch } from '../lib/api';
import { DEFAULT_SECTION_VISIBILITY, type SectionVisibility } from '../services/sectionVisibility';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, BarChart3, Trash2, Search, Check, CheckCircle2,
  LogOut, Printer, FileSpreadsheet, Eye, Pencil, X, Wallet,
  Calendar, Zap, Database, Minus, Plus, Users, MessageSquare, Loader2, EyeOff, Store, TrendingUp,
} from 'lucide-react';
import { Payment } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────
const cleanName = (name: string) => {
  if (!name) return '';
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').toUpperCase().trim();
};
const cleanAmount = (val: any) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
};
const parseAppDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  if (dateValue.seconds) return new Date(dateValue.seconds * 1000);
  const d = new Date(dateValue);
  return isNaN(d.getTime()) ? null : d;
};
const getTS = (f: any) => { const d = new Date(f); return isNaN(d.getTime()) ? 0 : d.getTime() / 1000; };

// ─── Confirm Modal ───────────────────────────────────────────────────────────
function ConfirmModal({ isOpen, onClose, onConfirm, title, message }: any) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="bg-white rounded-[24px] p-6 max-w-sm w-full relative z-10 shadow-2xl space-y-4">
        <h3 className="font-bold text-base-text">{title}</h3>
        <p className="text-sm text-base-text-muted">{message}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-100 rounded-xl text-xs font-bold">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-bold">Eliminar</button>
        </div>
      </div>
    </div>
  );
}

type TabId = 'sistema' | 'ia' | 'datos' | 'base';

type CustomerLite = {
  id: string;
  name: string;
  phone?: string;
  waNumber?: string;
};

// ─── Main Component ──────────────────────────────────────────────────────────
function SettingsView({ payments, customers = [], onRefresh, onLogout, userId = '', sectionVisibility = DEFAULT_SECTION_VISIBILITY, onSectionVisibilityChange = () => {} }: {
  payments: Payment[];
  customers?: CustomerLite[];
  onRefresh?: () => void;
  onLogout: () => void;
  userId?: string;
  sectionVisibility?: SectionVisibility;
  onSectionVisibilityChange?: (value: SectionVisibility) => void;
  key?: string;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('sistema');
  const [officialPhone, setOfficialPhone] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);

  useEffect(() => {
    fetch('/api/store/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const num = String(data.official_wa_number || data.store_phone || '').replace(/\D/g, '');
        if (num) setOfficialPhone(num);
      })
      .catch(() => {});
  }, []);

  const saveOfficialPhone = async () => {
    if (!officialPhone) return;
    setPhoneSaving(true);
    try {
      await fetch('/api/store/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ official_wa_number: officialPhone }),
      });
    } finally {
      setPhoneSaving(false);
    }
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'sistema', label: 'Sistema', icon: <Package size={13} /> },
    { id: 'ia',      label: 'IA',      icon: <Zap size={13} /> },
    { id: 'datos',   label: 'Datos',   icon: <Database size={13} /> },
    { id: 'base',    label: 'Base',    icon: <Users size={13} /> },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.1, ease: 'linear' }}
      className="space-y-3 pb-12"
    >
      {/* Header */}
      <div className="flex justify-between items-center px-1">
        <h2 className="text-2xl font-extrabold text-base-text tracking-tight">Configuración</h2>
        <button onClick={onLogout} className="p-2 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* ─── Tabs horizontales ─── */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-black transition-all ${
              activeTab === tab.id
                ? 'bg-white text-[#ff2d78] shadow-sm'
                : 'text-gray-400 hover:text-gray-500'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Contenido del tab activo ─── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          {activeTab === 'sistema' && (
            <TabSistema
              officialPhone={officialPhone}
              setOfficialPhone={setOfficialPhone}
              phoneSaving={phoneSaving}
              saveOfficialPhone={saveOfficialPhone}
              sectionVisibility={sectionVisibility}
              onSectionVisibilityChange={onSectionVisibilityChange}
            />
          )}

          {activeTab === 'ia' && (
            userId
              ? <AiSettingsPanel userId={userId} />
              : <p className="text-center text-sm text-gray-400 py-8">Inicia sesión para ver la configuración de IA</p>
          )}

          {activeTab === 'datos' && <TabDatos payments={payments} onRefresh={onRefresh} userId={userId} />}

          {activeTab === 'base' && <TabBaseDatos payments={payments} customers={customers} onRefresh={onRefresh} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: BASE — Limpieza simple de perfiles y pagos
// ═══════════════════════════════════════════════════════════════════
function TabBaseDatos({ payments, customers, onRefresh }: {
  payments: Payment[];
  customers: CustomerLite[];
  onRefresh?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [storeProfiles, setStoreProfiles] = useState<any[]>([]);
  const [confirm, setConfirm] = useState<{ type: 'profile' | 'payment'; profile?: any; payment?: Payment } | null>(null);

  useEffect(() => {
    let mounted = true;
    adminApi.storeProfiles()
      .then(data => { if (mounted) setStoreProfiles(Array.isArray(data) ? data : []); })
      .catch(() => { if (mounted) setStoreProfiles([]); });
    return () => { mounted = false; };
  }, []);

  const profiles = useMemo(() => {
    const groups: Record<string, any> = {};

    customers.forEach(c => {
        groups[c.id] = {
          key: c.id,
          customerId: c.id,
          name: c.name,
          phone: c.waNumber || c.phone || '',
          payments: [],
          storeOrders: [],
          total: 0,
          hasMain: true,
          hasStore: false,
        };
      });

    payments.forEach(p => {
      const customer = customers.find(c => p.customerId && c.id === p.customerId) ||
        customers.find(c => cleanName(c.name) === cleanName(p.nombre));
      const key = customer?.id || cleanName(p.nombre);
      if (!groups[key]) {
        groups[key] = {
          key,
          customerId: customer?.id ?? null,
          name: customer?.name || p.nombre,
          phone: customer?.waNumber || customer?.phone || '',
          payments: [],
          storeOrders: [],
          total: 0,
          hasMain: !!customer,
          hasStore: false,
        };
      }
      groups[key].payments.push(p);
      groups[key].total += cleanAmount(p.pago);
    });

    storeProfiles.forEach(profile => {
      const phone = String(profile.phone ?? '');
      const customer = phone
        ? customers.find(c => [c.phone, c.waNumber].some(v => String(v ?? '').replace(/\D/g, '').endsWith(phone.replace(/^591/, ''))))
        : customers.find(c => cleanName(c.name) === cleanName(profile.name));
      const key = customer?.id || (phone ? `store-${phone}` : `store-${cleanName(profile.name)}`);
      if (!groups[key]) {
        groups[key] = {
          key,
          customerId: customer?.id ?? null,
          name: customer?.name || profile.name || 'Cliente tienda',
          phone: profile.phone || customer?.waNumber || customer?.phone || '',
          payments: [],
          storeOrders: [],
          total: 0,
          hasMain: !!customer,
          hasStore: true,
        };
      }
      groups[key].hasStore = true;
      if (!groups[key].phone && profile.phone) groups[key].phone = profile.phone;
      groups[key].storeOrders = profile.orders ?? [];
      groups[key].storeTotal = Number(profile.total ?? 0);
    });

    return Object.values(groups)
      .filter((profile: any) => profile.payments.length > 0 || profile.customerId || profile.hasStore)
      .filter((profile: any) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return profile.name.toLowerCase().includes(q) || String(profile.phone ?? '').includes(q);
      })
      .sort((a: any, b: any) => (b.total + (b.storeTotal ?? 0)) - (a.total + (a.storeTotal ?? 0)))
      .slice(0, 80);
  }, [customers, payments, storeProfiles, search]);

  const executeConfirm = async () => {
    if (!confirm) return;
    setLoading(true);
    try {
      if (confirm.type === 'profile' && confirm.profile) {
        await adminApi.rootDelete({
          customerId: confirm.profile.customerId,
          name: confirm.profile.name,
          phone: confirm.profile.phone,
        });
      }
      if (confirm.type === 'payment' && confirm.payment) {
        await pagosApi.delete(confirm.payment.id);
      }
      setConfirm(null);
      onRefresh?.();
      adminApi.storeProfiles()
        .then(data => setStoreProfiles(Array.isArray(data) ? data : []))
        .catch(() => setStoreProfiles([]));
    } catch (error) {
      console.error(error);
      alert('No se pudo borrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="rounded-[20px] bg-white border border-gray-100 p-4 space-y-3">
        <div>
          <p className="text-[12px] font-black text-gray-800">Limpieza de pruebas</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Borra un perfil completo o un pago suelto.</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar nombre o número..."
            className="w-full border border-gray-200 rounded-2xl pl-9 pr-3 py-3 text-[13px] font-bold outline-none focus:border-[#ff2d78]"
          />
        </div>
      </div>

      <div className="space-y-2">
        {profiles.length === 0 ? (
          <p className="text-center text-[11px] text-gray-400 py-8">No hay resultados</p>
        ) : profiles.map((profile: any) => {
          const isOpen = openKey === profile.key;
          return (
          <div key={profile.key} className="rounded-[20px] bg-white border border-gray-100 p-3 space-y-3">
            <button
              onClick={() => setOpenKey(isOpen ? null : profile.key)}
              className="w-full flex items-center gap-3 text-left"
            >
              <div className="w-9 h-9 rounded-2xl bg-pink-50 text-[#ff2d78] flex items-center justify-center font-black text-xs">
                {String(profile.name || '?').charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-gray-800 uppercase truncate">{profile.name}</p>
                <p className="text-[10px] text-gray-400 font-bold">
                  {profile.phone ? String(profile.phone).replace(/^591/, '') : 'Sin número'} · {profile.payments.length} pago{profile.payments.length === 1 ? '' : 's'} · {profile.storeOrders?.length ?? 0} tienda
                </p>
              </div>
              <div className="flex items-center gap-1">
                {profile.hasStore && <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-600 text-[9px] font-black">Tienda</span>}
                {profile.hasMain && <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[9px] font-black">App</span>}
                <span className="text-gray-300 text-xs font-black">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {isOpen && (
              <div className="space-y-3 border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                    Bs {profile.total} pagos · Bs {profile.storeTotal ?? 0} tienda
                  </div>
                  <button
                disabled={loading}
                onClick={() => setConfirm({ type: 'profile', profile })}
                className="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-black disabled:opacity-50"
              >
                Borrar todo
              </button>
                </div>

                {profile.payments.length > 0 && (
              <div className="space-y-1 max-h-44 overflow-y-auto">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider px-1">Pagos</p>
                {profile.payments.slice(0, 20).map((payment: Payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-gray-50">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-gray-700">Bs {cleanAmount(payment.pago)}</p>
                      <p className="text-[9px] text-gray-400">
                        {parseAppDate(payment.date)?.toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) ?? 'Sin fecha'}
                      </p>
                    </div>
                    <button
                      disabled={loading}
                      onClick={() => setConfirm({ type: 'payment', payment })}
                      className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                      title="Borrar este pago"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

                {(profile.storeOrders?.length ?? 0) > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider px-1">Tienda</p>
                    {profile.storeOrders.slice(0, 10).map((order: any) => (
                      <div key={order.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50/60">
                        <div>
                          <p className="text-[10px] font-black text-blue-700">Pedido #{order.id}</p>
                          <p className="text-[9px] text-blue-400">{order.status ?? 'sin estado'}</p>
                        </div>
                        <span className="text-[10px] font-black text-blue-700">Bs {cleanAmount(order.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>

      <ConfirmModal
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={executeConfirm}
        title={confirm?.type === 'profile' ? 'Borrar perfil completo' : 'Borrar pago'}
        message={confirm?.type === 'profile'
          ? `Se borrará todo rastro de ${confirm.profile?.name}: perfil, pagos, tienda y WhatsApp.`
          : 'Se borrará solo este pago.'}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: DATOS — Exportar + Gestión de Pagos
// ═══════════════════════════════════════════════════════════════════
function TabDatos({ payments, onRefresh, userId }: { payments: Payment[]; onRefresh?: () => void; userId?: string }) {
  const [exportDate, setExportDate] = useState(new Date().toISOString().split('T')[0]);
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const [searchName, setSearchName] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ id?: string; bulk?: boolean } | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Conversaciones WhatsApp
  type Conversacion = { id: string; nombre: string | null; phone: string | null; mensajes: number };
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [selectedConvIds, setSelectedConvIds] = useState<Set<string>>(new Set());
  const [confirmDeleteConv, setConfirmDeleteConv] = useState<'selected' | 'all' | null>(null);
  const [deletingConv, setDeletingConv] = useState(false);

  const cargarConversaciones = async () => {
    setLoadingConv(true);
    try {
      const data = await apiFetch('/api/live-sales/conversations');
      setConversaciones(data.conversaciones ?? []);
    } catch (e) { console.error(e); }
    finally { setLoadingConv(false); }
  };

  const toggleConv = (id: string) => {
    const next = new Set(selectedConvIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedConvIds(next);
  };

  const ejecutarBorradoConv = async () => {
    setDeletingConv(true);
    try {
      const ids = confirmDeleteConv === 'all' ? [] : [...selectedConvIds];
      await apiFetch('/api/live-sales/conversations', {
        method: 'DELETE',
        body: JSON.stringify({ ids }),
      });
      setSelectedConvIds(new Set());
      setConversaciones([]);
      await cargarConversaciones();
    } catch (e) { console.error(e); alert('Error al eliminar.'); }
    finally { setDeletingConv(false); setConfirmDeleteConv(null); }
  };

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const pDate = parseAppDate(p.date);
      if (!pDate) return false;
      return pDate.toISOString().split('T')[0] === exportDate;
    });
  }, [payments, exportDate]);

  const managedPayments = useMemo(() => {
    if (!searchName && !searchDate) return [];
    return payments.filter(p => {
      const matchesName = !searchName || cleanName(p.nombre).toLowerCase().includes(searchName.toLowerCase());
      const pDate = parseAppDate(p.date);
      const matchesDate = !searchDate || (pDate && pDate.toISOString().split('T')[0] === searchDate);
      return matchesName && matchesDate;
    }).sort((a, b) => getTS(b.date) - getTS(a.date)).slice(0, 50);
  }, [payments, searchName, searchDate]);

  const stats = useMemo(() => ({
    total: filteredPayments.reduce((acc, p) => acc + cleanAmount(p.pago), 0),
    count: filteredPayments.length,
  }), [filteredPayments]);

  const handleExportCSV = () => {
    if (filteredPayments.length === 0) { alert('No hay transacciones para esta fecha.'); return; }
    const headers = ['Nombre', 'Monto Bs', 'Fecha', 'Hora'];
    const rows = filteredPayments.map(p => {
      const pDate = parseAppDate(p.date);
      return [
        `"${cleanName(p.nombre)}"`,
        cleanAmount(p.pago),
        `"${pDate ? pDate.toLocaleDateString('es-BO') : ''}"`,
        `"${pDate ? pDate.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : ''}"`,
      ];
    });
    const csvContent = '﻿' + 'sep=;\n' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Reporte_${exportDate}.csv`;
    link.click();
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.bulk) {
        await Promise.all([...selectedIds].map(id => pagosApi.delete(id)));
        setSelectedIds(new Set());
      } else if (confirmDelete.id) {
        await pagosApi.delete(confirmDelete.id);
      }
      onRefresh?.();
    } catch (e) { console.error(e); alert('No se pudo eliminar.'); }
    finally { setConfirmDelete(null); }
  };

  const handleSaveName = async (id: string) => {
    if (!editingName.trim()) return;
    try { await pagosApi.update(id, { nombre: editingName.trim() }); onRefresh?.(); }
    catch (e) { console.error(e); alert('No se pudo guardar.'); }
    setEditingPaymentId(null);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="space-y-4 pt-2">
      {/* Exportar */}
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Exportar</p>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="date"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-medium outline-none focus:border-pink-400"
            value={exportDate}
            onChange={e => setExportDate(e.target.value)}
          />
          <span className="text-[11px] font-black text-[#ff2d78]">Bs {stats.total}</span>
          <span className="text-[11px] font-bold text-gray-400">{stats.count} pag.</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowReport(true); setTimeout(() => window.print(), 300); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#ff2d78] text-white text-[11px] font-black"
          >
            <Printer size={12} /> PDF
          </button>
          <button
            onClick={handleExportCSV}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-600 text-white text-[11px] font-black"
          >
            <FileSpreadsheet size={12} /> Excel
          </button>
          <button
            onClick={() => setShowReport(true)}
            className="px-3 py-2 rounded-xl bg-gray-100 text-gray-500 text-[11px] font-black flex items-center gap-1"
          >
            <Eye size={12} />
          </button>
        </div>
      </div>

      {/* Gestión de Pagos */}
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">Gestión de Pagos</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input
              type="text"
              placeholder="Nombre..."
              className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2 text-[12px] outline-none focus:border-pink-400"
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
            />
          </div>
          <input
            type="date"
            className="border border-gray-200 rounded-xl px-3 py-2 text-[12px] outline-none focus:border-pink-400"
            value={searchDate}
            onChange={e => setSearchDate(e.target.value)}
          />
        </div>

        {managedPayments.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-0.5">
              <button onClick={() => {
                if (selectedIds.size === managedPayments.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(managedPayments.map(p => p.id)));
              }} className="text-[10px] font-black text-[#ff2d78]">
                {selectedIds.size === managedPayments.length ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
              {selectedIds.size > 0 && (
                <button onClick={() => setConfirmDelete({ bulk: true })}
                  className="flex items-center gap-1 text-[10px] font-black text-rose-500">
                  <Trash2 size={11} /> Eliminar ({selectedIds.size})
                </button>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1">
              {managedPayments.map((p: any) => (
                <div
                  key={p.id}
                  onClick={() => !editingPaymentId && toggleSelect(p.id)}
                  className={`px-3 py-2 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${selectedIds.has(p.id) ? 'bg-rose-50 border-rose-100' : 'bg-gray-50 border-gray-100'}`}
                >
                  {editingPaymentId === p.id ? (
                    <div className="flex-1 flex gap-1.5">
                      <input
                        type="text"
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                      />
                      <button onClick={e => { e.stopPropagation(); handleSaveName(p.id); }}
                        className="p-1.5 bg-emerald-500 text-white rounded-lg"><Check size={12} /></button>
                      <button onClick={e => { e.stopPropagation(); setEditingPaymentId(null); }}
                        className="p-1.5 bg-gray-200 rounded-lg"><X size={12} /></button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-gray-800 truncate uppercase">{p.nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-black text-[#ff2d78]">Bs {cleanAmount(p.pago)}</span>
                        <span className="text-[9px] text-gray-400">
                          {parseAppDate(p.date)?.toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    </div>
                  )}
                  {!editingPaymentId && (
                    <div className="flex gap-1">
                      <button onClick={e => { e.stopPropagation(); setEditingPaymentId(p.id); setEditingName(p.nombre); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-[#ff2d78]"><Pencil size={12} /></button>
                      <button onClick={e => { e.stopPropagation(); setConfirmDelete({ id: p.id }); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500"><Trash2 size={12} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {(searchName || searchDate) && managedPayments.length === 0 && (
          <p className="text-center text-[11px] text-gray-400 py-4">Sin resultados</p>
        )}
      </div>

      {/* Conversaciones WhatsApp */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
            <MessageSquare size={11} /> Conversaciones WhatsApp
          </p>
          <button
            onClick={cargarConversaciones}
            disabled={loadingConv}
            className="text-[10px] font-bold text-brand flex items-center gap-1"
          >
            {loadingConv ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
            {conversaciones.length > 0 ? 'Recargar' : 'Ver'}
          </button>
        </div>

        {conversaciones.length > 0 && (
          <>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setSelectedConvIds(new Set(conversaciones.map(c => c.id)))}
                className="text-[10px] font-bold text-gray-500 px-2 py-1 bg-gray-100 rounded-lg"
              >Seleccionar todo</button>
              <button
                onClick={() => setSelectedConvIds(new Set())}
                className="text-[10px] font-bold text-gray-500 px-2 py-1 bg-gray-100 rounded-lg"
              >Quitar selección</button>
              {selectedConvIds.size > 0 && (
                <button
                  onClick={() => setConfirmDeleteConv('selected')}
                  className="text-[10px] font-bold text-rose-600 px-2 py-1 bg-rose-50 rounded-lg ml-auto"
                >Eliminar ({selectedConvIds.size})</button>
              )}
              <button
                onClick={() => setConfirmDeleteConv('all')}
                className="text-[10px] font-bold text-rose-600 px-2 py-1 bg-rose-50 rounded-lg"
              >Borrar todo</button>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {conversaciones.map(c => (
                <div
                  key={c.id}
                  onClick={() => toggleConv(c.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all ${
                    selectedConvIds.has(c.id) ? 'bg-rose-50 border border-rose-200' : 'bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                    selectedConvIds.has(c.id) ? 'bg-rose-500 border-rose-500' : 'border-gray-300'
                  }`}>
                    {selectedConvIds.has(c.id) && <Check size={9} className="text-white" strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-700 truncate">{c.nombre ?? 'Sin nombre'}</p>
                    <p className="text-[10px] text-gray-400">{c.phone ?? '—'} · {c.mensajes} mensajes</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {conversaciones.length === 0 && !loadingConv && (
          <p className="text-center text-[11px] text-gray-400 py-3">Toca "Ver" para cargar conversaciones</p>
        )}
      </div>

      <ConfirmModal
        isOpen={!!confirmDeleteConv}
        onClose={() => setConfirmDeleteConv(null)}
        onConfirm={ejecutarBorradoConv}
        title="Eliminar conversaciones"
        message={
          confirmDeleteConv === 'all'
            ? '¿Eliminar TODAS las conversaciones WhatsApp? Esto borra mensajes, comprobantes y pagos del panel.'
            : `¿Eliminar ${selectedConvIds.size} conversación(es) seleccionada(s)?`
        }
      />

      {/* Print Modal */}
      <AnimatePresence>
        {showReport && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowReport(false)} />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[28px] overflow-hidden relative z-10"
              style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
            >
              <div ref={reportRef} className="bg-white">
                <div className="p-5 bg-[#ff2d78] text-white flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight">Reporte Diario</h3>
                    <p className="text-[10px] font-bold opacity-80 mt-0.5">{exportDate}</p>
                  </div>
                  <Wallet className="w-5 h-5 opacity-60" />
                </div>
                <div className="p-5 space-y-3">
                  <div className="grid grid-cols-2 gap-4 pb-3 border-b border-gray-100">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Total</p>
                      <p className="text-xl font-black text-[#ff2d78]">Bs {stats.total}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Pagos</p>
                      <p className="text-xl font-black text-gray-800">{stats.count}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {filteredPayments.length === 0
                      ? <p className="text-center text-xs text-gray-300 py-6">Sin datos para esta fecha</p>
                      : filteredPayments.map((p, i) => {
                        const d = parseAppDate(p.date);
                        return (
                          <div key={`${p.id}-${i}`} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-xl">
                            <div>
                              <p className="text-[11px] font-black uppercase text-gray-800">{cleanName(p.nombre)}</p>
                              <p className="text-[9px] text-gray-400">{d ? d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                            </div>
                            <span className="font-black text-[#ff2d78]">Bs {cleanAmount(p.pago)}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
              <div className="p-3 bg-gray-50 border-t border-gray-100 flex gap-2">
                <button onClick={() => setShowReport(false)}
                  className="flex-1 py-2.5 bg-white border border-gray-200 text-gray-400 rounded-xl text-[11px] font-black">
                  Cerrar
                </button>
                <button onClick={() => window.print()}
                  className="flex-1 py-2.5 bg-[#ff2d78] text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5">
                  <Calendar size={12} /> Imprimir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={executeDelete}
        title={confirmDelete?.bulk ? 'Eliminar Pagos' : 'Eliminar Pago'}
        message={confirmDelete?.bulk
          ? `¿Eliminar ${selectedIds.size} pagos permanentemente?`
          : '¿Eliminar este pago permanentemente?'}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: SISTEMA — Casilleros + Versión
// ═══════════════════════════════════════════════════════════════════
function TabSistema({
  officialPhone,
  setOfficialPhone,
  phoneSaving,
  saveOfficialPhone,
  sectionVisibility,
  onSectionVisibilityChange,
}: {
  officialPhone: string;
  setOfficialPhone: (value: string) => void;
  phoneSaving: boolean;
  saveOfficialPhone: () => void;
  sectionVisibility: SectionVisibility;
  onSectionVisibilityChange: (value: SectionVisibility) => void;
}) {
  const [numericCapacity, setNumericCapacity] = useState(4);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  React.useEffect(() => {
    fetch('/api/storage/config')
      .then(r => r.json())
      .then(d => setNumericCapacity(d.numeric_capacity ?? 4))
      .catch(() => {});
  }, []);

  const handleSave = async (newVal: number) => {
    if (newVal < 1) return;
    setSaving(true);
    try {
      const res = await fetch('/api/storage/config/numeric-capacity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capacity: newVal }),
      });
      if (!res.ok) throw new Error();
      setNumericCapacity(newVal);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { alert('Error al guardar. Intenta de nuevo.'); }
    finally { setSaving(false); }
  };

  const adjust = (delta: number) => {
    const next = numericCapacity + delta;
    if (next >= 1) { setNumericCapacity(next); handleSave(next); }
  };

  return (
    <div className="space-y-3 pt-2">
      {/* WhatsApp */}
      <WhatsappConnectionPanel />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div>
          <p className="text-sm font-black text-gray-800">Número oficial de WhatsApp</p>
          <p className="text-[11px] text-gray-400 font-medium">
            Número conectado al Bridge. Se usa en todos los botones de la aplicación.
          </p>
        </div>
        <input
          type="text"
          value={officialPhone}
          onChange={e => setOfficialPhone(e.target.value.replace(/\D/g, ''))}
          placeholder="59160000000"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] font-bold outline-none focus:border-pink-400"
        />
        <button
          onClick={saveOfficialPhone}
          disabled={phoneSaving}
          className="w-full h-10 rounded-xl bg-[#ff2d78] text-[12px] font-black text-white shadow-sm disabled:opacity-50"
        >
          {phoneSaving ? 'Guardando...' : 'Guardar número'}
        </button>
      </div>

      {/* Etiquetas */}
      <div className="flex items-center justify-between py-1">
        <div>
          <p className="text-[12px] font-black text-gray-700">Capacidad de etiquetas</p>
          <p className="text-[10px] text-gray-400">Bolsas máx por etiqueta</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => adjust(-1)}
            disabled={numericCapacity <= 1 || saving}
            className="w-7 h-7 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 disabled:opacity-30"
          >
            <Minus size={13} />
          </button>
          <span className="w-6 text-center text-lg font-black text-gray-800">{numericCapacity}</span>
          <button
            onClick={() => adjust(1)}
            disabled={saving}
            className="w-7 h-7 rounded-xl bg-[#ff2d78] flex items-center justify-center text-white disabled:opacity-40"
          >
            <Plus size={13} />
          </button>
          {saved && <CheckCircle2 size={14} className="text-emerald-500" />}
        </div>
      </div>

      {/* Info */}
      <div className="space-y-1.5 pt-1 border-t border-gray-100">
        <div className="flex justify-between">
          <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Versión</span>
          <span className="text-[11px] font-bold text-gray-600">2.1.0</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Base de Datos</span>
          <span className="text-[11px] font-bold text-emerald-600">Conectado</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Soporte IA</span>
          <span className="text-[11px] font-bold text-[#ff2d78]">Activo</span>
        </div>
      </div>

      <SectionVisibilityPanel
        value={sectionVisibility}
        onChange={onSectionVisibilityChange}
      />
    </div>
  );
}

function SectionVisibilityPanel({
  value,
  onChange,
}: {
  value: SectionVisibility;
  onChange: (next: SectionVisibility) => void;
}) {
  const toggle = (section: keyof SectionVisibility) => {
    onChange({ ...value, [section]: !value[section] });
  };

  return (
    <div className="mt-2 bg-gray-50/70 rounded-xl border border-gray-100/80 p-2.5 space-y-2">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg bg-white text-gray-400 flex items-center justify-center shrink-0">
          <EyeOff size={14} />
        </div>
        <div>
          <p className="text-[11px] font-black text-gray-700">Ocultar secciones</p>
          <p className="text-[9px] text-gray-400 font-medium">
            Solo cambia tu menú. No elimina datos ni funciones.
          </p>
        </div>
      </div>

      <VisibilitySwitch
        label="Dinero"
        description="Ocultar el apartado de dinero"
        icon={<TrendingUp size={15} />}
        hidden={value.dinero}
        onClick={() => toggle('dinero')}
      />
      <VisibilitySwitch
        label="Tienda"
        description="Ocultar el panel de tienda"
        icon={<Store size={15} />}
        hidden={value.tienda}
        onClick={() => toggle('tienda')}
      />
    </div>
  );
}

function VisibilitySwitch({
  label,
  description,
  icon,
  hidden,
  onClick,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  hidden: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/80 px-2.5 py-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-gray-500 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-[11px] font-black text-gray-700">{label}</p>
          <p className="text-[9px] text-gray-400 truncate">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={hidden}
        aria-label={`Ocultar ${label}`}
        onClick={onClick}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${hidden ? 'bg-[#ff2d78]' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-1 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${hidden ? 'translate-x-5' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}

export default SettingsView;
