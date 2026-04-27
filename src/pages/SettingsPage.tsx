import React, { useState, useMemo, useRef } from 'react';
import { AiSettingsPanel } from '../components/AiSettingsPanel';
import { IdentityPanel } from '../components/IdentityPanel';
import { WhatsappConnectionPanel } from '../components/WhatsappConnectionPanel';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, BarChart3, Trash2, Search, Check, CheckCircle2,
  LogOut, Printer, FileSpreadsheet, Eye, Pencil, X, Wallet,
  Calendar, Zap, Database, Minus, Plus, Users, ChevronDown,
} from 'lucide-react';
import { Payment } from '../types';
import { db, doc, updateDoc, deleteDoc, writeBatch } from '../lib/firebase-compat';

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

// ─── Accordion Item ──────────────────────────────────────────────────────────
function AccordionSection({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[#ff2d78]">{icon}</span>
          <span className="text-[13px] font-black text-gray-800">{label}</span>
        </div>
        <ChevronDown
          size={16}
          className="text-gray-400 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-gray-50">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
function SettingsView({ payments, onLogout, userId = '' }: {
  payments: Payment[];
  onLogout: () => void;
  userId?: string;
  key?: string;
}) {
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

      {/* Acordeón */}
      <AccordionSection icon={<Zap size={15} />} label="Inteligencia Artificial">
        {userId
          ? <AiSettingsPanel userId={userId} />
          : <p className="text-center text-sm text-gray-400 py-4">Inicia sesión para ver la configuración de IA</p>
        }
      </AccordionSection>

      <AccordionSection icon={<Users size={15} />} label="Identidad">
        {userId
          ? <IdentityPanel userId={userId} />
          : <p className="text-center text-sm text-gray-400 py-4">Inicia sesión para ver los perfiles de identidad</p>
        }
      </AccordionSection>

      <AccordionSection icon={<Database size={15} />} label="Datos y Exportación">
        <TabDatos payments={payments} />
      </AccordionSection>

      <AccordionSection icon={<Package size={15} />} label="Sistema">
        <TabSistema />
      </AccordionSection>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: DATOS — Exportar + Gestión de Pagos
// ═══════════════════════════════════════════════════════════════════
function TabDatos({ payments }: { payments: Payment[] }) {
  const [exportDate, setExportDate] = useState(new Date().toISOString().split('T')[0]);
  const [showReport, setShowReport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const [searchName, setSearchName] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ id?: string; bulk?: boolean } | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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
        const batch = writeBatch(db);
        selectedIds.forEach(id => batch.delete(doc(db, 'pagos', id)));
        await batch.commit();
        setSelectedIds(new Set());
      } else if (confirmDelete.id) {
        await deleteDoc(doc(db, 'pagos', confirmDelete.id));
      }
    } catch (e) { console.error(e); }
    finally { setConfirmDelete(null); }
  };

  const handleSaveName = async (id: string) => {
    if (!editingName.trim()) return;
    try { await updateDoc(doc(db, 'pagos', id), { nombre: editingName.trim() }); }
    catch (e) { console.error(e); }
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
function TabSistema() {
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

      {/* Casilleros */}
      <div className="flex items-center justify-between py-1">
        <div>
          <p className="text-[12px] font-black text-gray-700">Casilleros Numéricos</p>
          <p className="text-[10px] text-gray-400">Bolsas máx por casillero</p>
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
    </div>
  );
}

export default SettingsView;
