import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, BarChart3, Trash2, Database, Shield, Search, Check, CheckCircle2, RefreshCw, LogOut, Printer, FileSpreadsheet, Eye, Pencil, X, Wallet, Calendar } from 'lucide-react';
import { Payment } from '../types';
import { db, collection, doc, updateDoc, deleteDoc, getDocs, writeBatch, serverTimestamp } from '../lib/firebase-compat';

// Helpers copiados de App.tsx (se moverán a utils.ts en siguiente fase)
const cleanName = (name: string) => {
  if (!name) return '';
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase().trim();
};
const cleanAmount = (val: any) => { if (typeof val === 'number') return val; if (!val) return 0; return parseFloat(String(val).replace(',', '.').replace(/[^0-9.]/g, '')) || 0; };
const getTS = (f: any) => { if (!f) return 0; const d = new Date(f); return isNaN(d.getTime()) ? 0 : d.getTime() / 1000; };
const parseAppDate = (dateValue: any): Date | null => { if (!dateValue) return null; if (dateValue.seconds) return new Date(dateValue.seconds * 1000); const d = new Date(dateValue); return isNaN(d.getTime()) ? null : d; };
const HistoricalRepairEngine = { analyze: async (_d: number = 90) => ({ resolved: { total: 0, pagos: 0, pedidos: 0, orders: 0 }, manual: { total: 0 }, pending_auto: { total: 0, pagos: 0, pedidos: 0, orders: 0 }, pending_manual: { total: 0 } }), repair: async (_d: number, _l: number, onProgress?: (m: string) => void) => { onProgress?.('No disponible'); } };
function ConfirmModal({ isOpen, onClose, onConfirm, title, message }: any) { if (!isOpen) return null; return (<div className='fixed inset-0 z-[500] flex items-center justify-center p-4'><div className='absolute inset-0 bg-black/30' onClick={onClose} /><div className='bg-white rounded-[24px] p-6 max-w-sm w-full relative z-10 shadow-2xl space-y-4'><h3 className='font-bold text-base-text'>{title}</h3><p className='text-sm text-base-text-muted'>{message}</p><div className='flex gap-3'><button onClick={onClose} className='flex-1 py-3 bg-gray-100 rounded-xl text-xs font-bold'>Cancelar</button><button onClick={onConfirm} className='flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-bold'>Eliminar</button></div></div></div>); }

function SettingsView({ payments, onLogout }: { payments: Payment[], onLogout: () => void, key?: string }) {
  const [exportDate, setExportDate] = useState(new Date().toISOString().split('T')[0]);
  const [showReport, setShowReport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // New states for payment management
  const [searchName, setSearchName] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ id?: string, bulk?: boolean } | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);
  const [maintenanceClicks, setMaintenanceClicks] = useState(0);

  // Configuración de capacidad de casilleros numéricos
  const [numericCapacity, setNumericCapacity] = useState<number>(4);
  const [capacityInput, setCapacityInput] = useState<string>('4');
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [capacitySaved, setCapacitySaved] = useState(false);

  useEffect(() => {
    fetch('/api/storage/config')
      .then(r => r.json())
      .then(data => {
        setNumericCapacity(data.numeric_capacity ?? 4);
        setCapacityInput(String(data.numeric_capacity ?? 4));
      })
      .catch(() => {});
  }, []);

  const handleSaveCapacity = async () => {
    const cap = Number(capacityInput);
    if (!cap || cap < 1) return;
    setSavingCapacity(true);
    try {
      const res = await fetch('/api/storage/config/numeric-capacity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capacity: cap }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      setNumericCapacity(cap);
      setCapacitySaved(true);
      setTimeout(() => setCapacitySaved(false), 2500);
    } catch {
      alert('Error al guardar la capacidad. Intenta de nuevo.');
    } finally {
      setSavingCapacity(false);
    }
  };

  // Phase 3: Historical Stabilization states
  const [repairAnalysis, setRepairAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairProgress, setRepairProgress] = useState('');
  const [recencyDays, setRecencyDays] = useState(90);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const report = await HistoricalRepairEngine.analyze(recencyDays);
      setRepairAnalysis(report);
    } catch (error) {
      console.error("Error analyzing:", error);
      alert("Error al analizar históricos.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExecuteRepair = async (isPilot: boolean = false) => {
    if (!repairAnalysis) return;
    const limit = isPilot ? 30 : 0;
    const confirmMsg = isPilot 
      ? "¿Deseas ejecutar el PILOTO CONTROLADO (máx 30 registros)? Esto permitirá validar el sistema con un lote pequeño."
      : "¿Estás seguro de ejecutar la REPARACIÓN COMPLETA? Se vincularán todos los registros y se convertirán órdenes activas según el análisis previo.";
    
    if (!confirm(confirmMsg)) return;
    
    setIsRepairing(true);
    try {
      await HistoricalRepairEngine.repair(recencyDays, limit, (msg) => setRepairProgress(msg));
      alert(isPilot ? "Piloto controlado completado con éxito." : "Reparación histórica completada con éxito.");
      setRepairAnalysis(null);
    } catch (error) {
      console.error("Error repairing:", error);
      alert("Error durante la reparación.");
    } finally {
      setIsRepairing(false);
      setRepairProgress('');
    }
  };

  const handleMaintenance = async () => {
    if (isMigrating) return;
    if (!confirm('¿Deseas ejecutar el RESETEO MAESTRO desde la raíz? Esto pondrá TODOS los pedidos y órdenes antiguas en estado "procesar" y reseteará prendas, bolsas y etiquetas a CERO. LOS PAGOS NO SE TOCARÁN.')) return;
    
    setIsMigrating(true);
    try {
      // 1. Fetch all collections that store work data
      const customersSnap = await getDocs(collection(db, 'customers'));
      const pedidosSnap = await getDocs(collection(db, 'pedidos'));
      const ordersSnap = await getDocs(collection(db, 'orders'));
      
      const allCustomers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      const allPedidos = pedidosSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      const allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      
      let batch = writeBatch(db);
      let count = 0;
      
      // Helper to handle batch limits (500)
      const checkBatch = async () => {
        count++;
        if (count >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      };

      // 2. Reset all customer labels
      for (const c of allCustomers) {
        batch.update(doc(db, 'customers', c.id), { 
          activeLabel: '', 
          activeLabelType: '',
          activeBagCount: 0,
          labelUpdatedAt: serverTimestamp(),
          labelVersion: 0
        });
        await checkBatch();
      }
      
      // 3. Reset all pedidos to initial state
      for (const p of allPedidos) {
        batch.update(doc(db, 'pedidos', p.id), { 
          status: 'procesar',
          label: '',
          labelType: '',
          bagCount: 0,
          itemCount: 0,
          labelVersion: 0
        });
        await checkBatch();
      }

      // 4. Reset all legacy orders to initial state
      for (const o of allOrders) {
        batch.update(doc(db, 'orders', o.id), { 
          status: 'procesar',
          label: '',
          labelType: '',
          bagCount: 0,
          itemCount: 0,
          // Legacy fields mapping (all possible variations)
          item_count: 0,
          bag_count: 0,
          prendaCount: 0,
          prendas: 0,
          bolsas: 0,
          cantidad: 0
        });
        await checkBatch();
      }
      
      await batch.commit();
      alert('RESETEO MAESTRO COMPLETADO DESDE LA RAÍZ. Todos los datos de trabajo han sido puestos a cero.');
    } catch (error) {
      console.error("Error in master reset:", error);
      alert('Error durante el reseteo maestro.');
    } finally {
      setIsMigrating(false);
      setMaintenanceClicks(0);
    }
  };

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      const pDate = parseAppDate(p.date);
      if (!pDate) return false;
      const dStr = pDate.toISOString().split('T')[0];
      return dStr === exportDate;
    });
  }, [payments, exportDate]);

  // New filtered payments for management
  const managedPayments = useMemo(() => {
    if (!searchName && !searchDate) return [];
    return payments.filter(p => {
      const matchesName = !searchName || cleanName(p.nombre).toLowerCase().includes(searchName.toLowerCase());
      const pDate = parseAppDate(p.date);
      const matchesDate = !searchDate || (pDate && pDate.toISOString().split('T')[0] === searchDate);
      return matchesName && matchesDate;
    }).sort((a, b) => getTS(b.date) - getTS(a.date)).slice(0, 50);
  }, [payments, searchName, searchDate]);

  const stats = useMemo(() => {
    const total = filteredPayments.reduce((acc, p) => acc + cleanAmount(p.pago), 0);
    return {
      total,
      count: filteredPayments.length
    };
  }, [filteredPayments]);

  const handleDeletePayment = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete({ id });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setConfirmDelete({ bulk: true });
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.bulk) {
        const batch = writeBatch(db);
        selectedIds.forEach(id => {
          batch.delete(doc(db, 'pagos', id));
        });
        await batch.commit();
        setSelectedIds(new Set());
      } else if (confirmDelete.id) {
        await deleteDoc(doc(db, 'pagos', confirmDelete.id));
      }
    } catch (error) {
      console.error("Error deleting:", error);
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleSaveName = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await updateDoc(doc(db, 'pagos', id), { nombre: editingName.trim() });
      setEditingPaymentId(null);
    } catch (error) {
      console.error("Error updating name:", error);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === managedPayments.length && managedPayments.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(managedPayments.map(p => p.id)));
    }
  };

  const handleExportCSV = () => {
    if (filteredPayments.length === 0) {
      alert('No hay transacciones para esta fecha.');
      return;
    }

    const headers = ['Nombre', 'Monto Bs', 'Fecha', 'Hora'];
    const rows = filteredPayments.map(p => {
      const pDate = parseAppDate(p.date);
      const dateStr = pDate ? pDate.toLocaleDateString('es-BO') : '';
      const timeStr = pDate ? pDate.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '';
      return [
        `"${cleanName(p.nombre)}"`,
        cleanAmount(p.pago),
        `"${dateStr}"`,
        `"${timeStr}"`
      ];
    });

    // "sep=;" tells Excel exactly which delimiter to use
    // \uFEFF is the BOM for UTF-8
    const csvContent = "\uFEFF" + "sep=;\n" + [
      headers.join(';'),
      ...rows.map(row => row.join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Reporte_Urkupina_${exportDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    if (filteredPayments.length === 0) {
      alert('No hay datos para imprimir.');
      return;
    }
    setShowReport(true);
    // Short delay to ensure modal is rendered before printing
    setTimeout(() => {
      window.print();
    }, 300);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.1, ease: "linear" }}
      className="space-y-6 pb-12"
    >
      <div className="flex justify-between items-center px-1">
        <h2 className="text-2xl font-extrabold text-base-text tracking-tight">Configuración</h2>
        <button 
          onClick={onLogout}
          className="p-2 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Casilleros Config Section */}
      <div className="card-modern p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand/10 flex items-center justify-center text-brand">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base-text uppercase tracking-tight">Casilleros Numéricos</h3>
            <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-widest">Capacidad máxima de bolsas por casillero</p>
          </div>
        </div>

        <p className="text-sm text-base-text-muted">
          Define cuántas bolsas puede almacenar cada casillero numérico (1, 2, 3...). El cambio aplica a <strong>todos</strong> los casilleros numéricos al instante.
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Bolsas por casillero</label>
            <input
              type="number"
              min={1}
              max={999}
              className="input-modern text-center text-2xl font-bold"
              value={capacityInput}
              onChange={e => setCapacityInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveCapacity()}
            />
          </div>
          <div className="pt-5">
            <button
              onClick={handleSaveCapacity}
              disabled={savingCapacity || Number(capacityInput) === numericCapacity}
              className="btn-pill-primary flex items-center gap-2 disabled:opacity-50"
            >
              {savingCapacity ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : capacitySaved ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {capacitySaved ? '¡Guardado!' : 'Guardar'}
            </button>
          </div>
        </div>

        <p className="text-xs text-base-text-muted">
          Valor actual: <strong>{numericCapacity} bolsas</strong> por casillero
        </p>
      </div>

      {/* Export Section */}
      <div className="card-modern p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand/10 flex items-center justify-center text-brand">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base-text uppercase tracking-tight">Exportar Reportes</h3>
            <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-widest">Respaldo de transacciones</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Seleccionar Fecha</label>
            <input 
              type="date" 
              className="input-modern"
              value={exportDate}
              onChange={(e) => setExportDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <span className="text-[9px] font-bold text-base-text-muted uppercase tracking-widest block mb-1">Total Día</span>
              <span className="text-xl font-black text-brand leading-none">Bs {stats.total}</span>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <span className="text-[9px] font-bold text-base-text-muted uppercase tracking-widest block mb-1">Pagos</span>
              <span className="text-xl font-black text-base-text leading-none">{stats.count}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button 
              onClick={handlePrint}
              className="btn-pill-primary py-4 flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimir Reporte (PDF)
            </button>
            
            <button 
              onClick={handleExportCSV}
              className="w-full py-3 bg-emerald-50 text-emerald-600 rounded-[20px] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Descargar Excel (CSV)
            </button>

            <button 
              onClick={() => setShowReport(true)}
              className="w-full py-3 bg-slate-50 text-slate-400 rounded-[20px] text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors"
            >
              <Eye className="w-3 h-3" />
              Previsualizar Datos
            </button>
          </div>
        </div>
      </div>

      {/* Payment Management Section */}
      <div className="card-modern p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-500">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base-text uppercase tracking-tight">Gestión de Pagos</h3>
            <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-widest">Buscar y eliminar registros</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Nombre Cliente (Original)</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Buscar en base de datos..."
                  className="input-modern pl-9 text-xs"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider ml-1">Fecha</label>
              <input 
                type="date" 
                className="input-modern text-xs"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
              />
            </div>
          </div>

          {managedPayments.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <div className="flex gap-4">
                  <button 
                    onClick={selectAll}
                    className="text-[9px] font-black text-brand uppercase tracking-widest"
                  >
                    {selectedIds.size === managedPayments.length ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>
                {selectedIds.size > 0 && (
                  <button 
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1.5 text-[9px] font-black text-rose-500 uppercase tracking-widest"
                  >
                    <Trash2 className="w-3 h-3" />
                    Eliminar ({selectedIds.size})
                  </button>
                )}
              </div>

              <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {managedPayments.map((p: any) => (
                  <div 
                    key={p.id}
                    onClick={() => !editingPaymentId && toggleSelect(p.id)}
                    className={`p-3 rounded-2xl border transition-all flex flex-col gap-2 ${selectedIds.has(p.id) ? 'bg-rose-50 border-rose-100' : 'bg-gray-50 border-gray-100 hover:border-gray-200'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {editingPaymentId === p.id ? (
                          <div className="flex gap-2">
                            <input 
                              type="text"
                              className="input-modern py-1 px-2 text-xs flex-1"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleSaveName(p.id); }}
                              className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
                            >
                              <Check size={14} />
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setEditingPaymentId(null); }}
                              className="p-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className="text-[10px] font-black text-base-text-muted uppercase tracking-tighter mb-0.5">Dato Original:</p>
                            <p className="text-xs font-bold text-base-text truncate uppercase">{p.nombre}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] font-bold text-brand uppercase">Bs {cleanAmount(p.pago)}</span>
                              <span className="text-[9px] font-medium text-base-text-muted">
                                {parseAppDate(p.date)?.toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!editingPaymentId && (
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setEditingPaymentId(p.id); 
                              setEditingName(p.nombre); 
                            }}
                            className="p-2 rounded-xl text-gray-400 hover:text-brand hover:bg-white transition-all"
                            title="Editar Nombre Original"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => handleDeletePayment(p.id, e)}
                          className="p-2 rounded-xl text-gray-400 hover:text-rose-500 hover:bg-white transition-all"
                          title="Eliminar Pago"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(searchName || searchDate) && managedPayments.length === 0 && (
            <div className="py-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-widest">No se encontraron pagos</p>
            </div>
          )}
        </div>
      </div>

      {/* Phase 3: Historical Stabilization Panel */}
      <div className="card-modern p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base-text uppercase tracking-tight">Estabilización de Datos</h3>
            <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-widest">Fase 3: Rescate de Históricos</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-base-text-muted uppercase tracking-wider">Días de Recencia (Conversión)</label>
            <input 
              type="number" 
              value={recencyDays}
              onChange={(e) => setRecencyDays(Number(e.target.value))}
              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-brand"
            />
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={handleAnalyze}
              disabled={isAnalyzing || isRepairing}
              className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all disabled:opacity-50"
            >
              {isAnalyzing ? 'Analizando...' : '1. Analizar Históricos'}
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => handleExecuteRepair(true)}
                disabled={!repairAnalysis || isRepairing || isAnalyzing}
                className="py-3 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
              >
                {isRepairing ? '...' : '2a. Ejecutar Piloto (30)'}
              </button>
              <button 
                onClick={() => handleExecuteRepair(false)}
                disabled={!repairAnalysis || isRepairing || isAnalyzing}
                className="py-3 bg-brand text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand/90 transition-all disabled:opacity-50 shadow-lg shadow-brand/20"
              >
                {isRepairing ? '...' : '2b. Reparación Total'}
              </button>
            </div>
          </div>

          {isRepairing && (
            <div className="p-3 bg-brand/5 border border-brand/10 rounded-xl text-center">
              <p className="text-[10px] font-bold text-brand uppercase animate-pulse">{repairProgress}</p>
            </div>
          )}

          {repairAnalysis && !isRepairing && (
            <div className="space-y-4 p-5 bg-gray-50 rounded-[24px] border border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-[10px] font-black text-base-text uppercase tracking-[0.2em]">Reporte de Estabilización</h4>
                <span className="px-2 py-0.5 bg-brand/10 text-brand text-[8px] font-bold rounded-full uppercase">Análisis v1</span>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                {/* Bloque 1: Resueltos / Estabilizados */}
                <div className="p-3 bg-white rounded-xl border border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Estabilizados (OK)</span>
                    <span className="text-sm font-black text-emerald-600">{repairAnalysis.resolved.total}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-[7px] font-bold text-gray-400 uppercase">Pagos</p>
                      <p className="text-[10px] font-black text-gray-600">{repairAnalysis.resolved.pagos}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[7px] font-bold text-gray-400 uppercase">Pedidos</p>
                      <p className="text-[10px] font-black text-gray-600">{repairAnalysis.resolved.pedidos}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[7px] font-bold text-gray-400 uppercase">Órdenes</p>
                      <p className="text-[10px] font-black text-gray-600">{repairAnalysis.resolved.orders}</p>
                    </div>
                  </div>
                </div>

                {/* Bloque 2: Pendientes Automáticos */}
                <div className="p-3 bg-brand/5 rounded-xl border border-brand/10">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] font-bold text-brand uppercase tracking-wider">Pendientes (Auto)</span>
                    <span className="text-sm font-black text-brand">{repairAnalysis.pending_auto.total}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-[7px] font-bold text-brand/40 uppercase">Pagos</p>
                      <p className="text-[10px] font-black text-brand">{repairAnalysis.pending_auto.pagos}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[7px] font-bold text-brand/40 uppercase">Pedidos</p>
                      <p className="text-[10px] font-black text-brand">{repairAnalysis.pending_auto.pedidos}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[7px] font-bold text-brand/40 uppercase">Órdenes</p>
                      <p className="text-[10px] font-black text-brand">{repairAnalysis.pending_auto.orders}</p>
                    </div>
                  </div>
                </div>

                {/* Bloque 3: Revisión Manual */}
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Revisión Manual</span>
                    <span className="text-sm font-black text-amber-600">{repairAnalysis.pending_manual.total + repairAnalysis.manual.total}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex justify-between items-center px-2">
                      <p className="text-[7px] font-bold text-amber-400 uppercase">Conflictos/Ambiguos</p>
                      <p className="text-[10px] font-black text-amber-600">{repairAnalysis.pending_manual.total + repairAnalysis.manual.total}</p>
                    </div>
                    <div className="flex justify-between items-center px-2">
                      <p className="text-[7px] font-bold text-amber-400 uppercase">No Identificados</p>
                      <p className="text-[10px] font-black text-amber-600">0</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200">
                <p className="text-[8px] font-bold text-base-text-muted uppercase leading-relaxed">
                  * Los casos de "Revisión Manual" no se tocarán automáticamente para proteger la integridad de los datos.
                  * El piloto procesará una muestra equilibrada de los "Pendientes (Auto)".
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* App Info */}
      <div className="card-modern p-6">
        <div className="flex items-center gap-3 mb-6" onClick={() => setMaintenanceClicks(prev => prev + 1)}>
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base-text uppercase tracking-tight">Sistema Urkupina</h3>
            <p className="text-[10px] font-bold text-base-text-muted uppercase tracking-widest">Versión 2.1.0</p>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
            <span className="text-[10px] font-bold text-base-text-muted uppercase">Base de Datos</span>
            <span className="text-[10px] font-bold text-emerald-500 uppercase">Conectado</span>
          </div>
          <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
            <span className="text-[10px] font-bold text-base-text-muted uppercase">Soporte IA</span>
            <span className="text-[10px] font-bold text-brand uppercase">Activo</span>
          </div>
          
          {maintenanceClicks >= 5 && (
            <button 
              onClick={handleMaintenance}
              disabled={isMigrating}
              className="w-full mt-4 py-3 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all disabled:opacity-50"
            >
              {isMigrating ? 'Procesando...' : 'RESETEO MAESTRO'}
            </button>
          )}
        </div>
      </div>

      {/* Detailed Report Modal */}
      <AnimatePresence>
        {showReport && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-base-text/20 backdrop-blur-sm" onClick={() => setShowReport(false)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden relative z-10"
            >
              <div ref={reportRef} className="bg-white">
                <div id="print-section" className="bg-white">
                  <div className="p-8 bg-brand text-white flex justify-between items-center print:bg-white print:text-black print:border-b print:border-gray-200">
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-tighter">URKUPINA</h3>
                      <p className="text-[10px] font-bold opacity-80 uppercase tracking-[0.2em]">Reporte Diario de Ventas</p>
                      <p className="text-xs font-bold mt-1">{exportDate}</p>
                    </div>
                    <div className="text-right print:hidden">
                      <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center ml-auto">
                        <Wallet className="w-6 h-6" />
                      </div>
                    </div>
                  </div>

                  <div className="p-8 space-y-6">
                    <div className="grid grid-cols-2 gap-8 pb-6 border-b border-gray-100">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Total Recaudado</span>
                        <span className="text-3xl font-black text-brand tracking-tighter">Bs {stats.total}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Transacciones</span>
                        <span className="text-3xl font-black text-gray-800 tracking-tighter">{stats.count}</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] mb-4">Detalle de Pagos</h4>
                      {filteredPayments.length === 0 ? (
                        <p className="text-center py-16 text-xs font-bold text-gray-300 uppercase tracking-widest">Sin datos para esta fecha</p>
                      ) : (
                        <div className="space-y-2">
                          {filteredPayments.map((p, idx) => {
                            const pDate = parseAppDate(p.date);
                            return (
                              <div key={`${p.id || idx}-${idx}`} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 print:bg-white print:border-b print:rounded-none print:p-2">
                                <div>
                                  <p className="text-xs font-black uppercase text-gray-800 tracking-tight">{cleanName(p.nombre)}</p>
                                  <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">
                                    {pDate ? pDate.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </p>
                                </div>
                                <span className="font-black text-brand text-base tracking-tight">Bs {cleanAmount(p.pago)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="pt-8 border-t border-gray-100 text-center">
                      <p className="text-[9px] font-bold text-gray-300 uppercase tracking-[0.2em]">Generado automáticamente por Sistema Urkupina</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                <button 
                  onClick={() => setShowReport(false)}
                  className="flex-1 py-4 bg-white border border-gray-200 text-gray-400 rounded-2xl text-[10px] font-black uppercase tracking-widest"
                >
                  Cerrar
                </button>
                <button 
                  onClick={() => window.print()}
                  className="flex-1 btn-pill-primary py-4 flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  Imprimir
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
        title={confirmDelete?.bulk ? "Eliminar Pagos" : "Eliminar Pago"}
        message={confirmDelete?.bulk 
          ? `¿Estás seguro de que deseas eliminar ${selectedIds.size} pagos permanentemente?`
          : "¿Estás seguro de que deseas eliminar este pago permanentemente?"}
      />
    </motion.div>
  );
}

export default SettingsView;