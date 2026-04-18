import React, { useState } from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';
import { ChevronLeft, MoreHorizontal, Calendar, ArrowUpRight, ArrowDownRight, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface CategoryData {
  name: string;
  value: number;
  color: string;
}

interface DetailedAnalysisProps {
  type: 'income' | 'expense';
  onBack: () => void;
  incomeData: CategoryData[];
  expenseData: CategoryData[];
}

export function DetailedAnalysis({ 
  type,
  onBack, 
  incomeData,
  expenseData,
}: DetailedAnalysisProps) {
  const [selectedType, setSelectedType] = useState<'income' | 'expense'>(type);

  const totalIncome = incomeData.reduce((acc, curr) => acc + curr.value, 0);
  const totalExpense = expenseData.reduce((acc, curr) => acc + curr.value, 0);
  const benefit = totalIncome - totalExpense;

  const chartData = [
    { name: 'Ingresos', value: totalIncome, color: '#10B981' }, // Emerald
    { name: 'Gastos', value: totalExpense, color: '#EF4444' }   // Red/Rose
  ];

  const breakdownData = selectedType === 'income' ? incomeData : expenseData;

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed inset-0 bg-base-bg z-[100] flex flex-col h-screen overflow-hidden text-base-text"
    >
      {/* Header with Coherent Buttons */}
      <div className="px-6 pt-8 pb-4 flex items-center justify-between bg-white border-b border-base-border">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-90">
          <ChevronLeft size={24} className="text-base-text" />
        </button>
        
        <h2 className="text-lg font-black text-base-text uppercase tracking-widest">
          Análisis de {selectedType === 'income' ? 'Ingresos' : 'Gastos'}
        </h2>

        <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <MoreHorizontal size={20} className="text-base-text-muted" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {/* Main Chart Area */}
        <div className="flex flex-col items-center justify-center px-6 py-12 relative min-h-[400px]">
          {breakdownData.length > 0 ? (
            <div className="w-80 h-80 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={breakdownData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={80} 
                    outerRadius={125} 
                    paddingAngle={5} 
                    dataKey="value" 
                    stroke="none"
                    startAngle={90}
                    endAngle={450}
                    className="outline-none"
                    animationBegin={0}
                    animationDuration={1000}
                    labelLine={false}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                      const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                      const x = cx + radius * Math.cos(-midAngle * (Math.PI / 180));
                      const y = cy + radius * Math.sin(-midAngle * (Math.PI / 180));
                      return (
                        <text 
                          x={x} 
                          y={y} 
                          fill="white" 
                          textAnchor="middle" 
                          dominantBaseline="central" 
                          className="text-[12px] font-black drop-shadow-sm"
                        >
                          {`${(percent * 100).toFixed(0)}%`}
                        </text>
                      );
                    }}
                  >
                    {breakdownData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color} 
                        className="outline-none transition-all duration-300 hover:opacity-80"
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Center Info - Dark Circle with White Border and Shadow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                <div className="w-36 h-36 rounded-full flex flex-col items-center justify-center bg-[#1a1f2e] shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-[6px] border-white z-10">
                  <span className="text-xl font-black text-white tracking-tight">
                    Bs {benefit.toLocaleString('es-BO', { minimumFractionDigits: 0 })}
                  </span>
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mt-1">
                    {benefit >= 0 ? 'IN' : 'OUT'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mb-4">
                <BarChart3 className="text-gray-300" size={32} />
              </div>
              <p className="text-sm font-bold text-base-text-muted">No hay datos de {selectedType === 'income' ? 'ingresos' : 'gastos'}</p>
              <p className="text-[10px] text-base-text-muted/60 mt-1">Registra transacciones para ver el análisis</p>
            </div>
          )}
        </div>

        {/* Legend and Selection - Professional Colored Text with Dots */}
        <div className="px-6 flex flex-wrap justify-center gap-x-12 gap-y-4 mb-10">
          <button 
            onClick={() => setSelectedType('income')}
            className="flex items-center gap-3 group transition-all active:scale-95"
          >
            <div className={cn(
              "w-3 h-3 rounded-full transition-all shadow-sm",
              selectedType === 'income' ? "bg-emerald-500 scale-125 ring-4 ring-emerald-500/20" : "bg-gray-300"
            )} />
            <span className={cn(
              "text-[12px] font-black uppercase tracking-[0.2em] transition-all",
              selectedType === 'income' ? "text-emerald-500" : "text-gray-400"
            )}>
              Ingresos
            </span>
          </button>

          <button 
            onClick={() => setSelectedType('expense')}
            className="flex items-center gap-3 group transition-all active:scale-95"
          >
            <div className={cn(
              "w-3 h-3 rounded-full transition-all shadow-sm",
              selectedType === 'expense' ? "bg-rose-500 scale-125 ring-4 ring-rose-500/20" : "bg-gray-300"
            )} />
            <span className={cn(
              "text-[12px] font-black uppercase tracking-[0.2em] transition-all",
              selectedType === 'expense' ? "text-rose-500" : "text-gray-400"
            )}>
              Gastos
            </span>
          </button>
        </div>

        {/* Breakdown List */}
        <div className="px-6 pb-24">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-base-text-muted">
              Desglose de {selectedType === 'income' ? 'Ingresos' : 'Gastos'}
            </h3>
            <span className="text-[10px] font-bold text-brand">{breakdownData.length} Categorías</span>
          </div>
          
          <div className="space-y-3">
            {breakdownData.map((item, idx) => (
              <motion.div 
                key={`${item.name}-${idx}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="card-modern flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-4">
                  <div 
                    className="w-10 h-10 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: `${item.color}15` }}
                  >
                    {selectedType === 'income' ? (
                      <ArrowUpRight className="text-emerald-500" size={20} />
                    ) : (
                      <ArrowDownRight className="text-rose-500" size={20} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-base-text">{item.name}</p>
                    <p className="text-[10px] font-medium text-base-text-muted">
                      {((item.value / (selectedType === 'income' ? totalIncome : totalExpense)) * 100).toFixed(1)}% del total
                    </p>
                  </div>
                </div>
                <span className={cn(
                  "text-sm font-black",
                  selectedType === 'income' ? "text-emerald-600" : "text-rose-600"
                )}>
                  Bs {item.value.toLocaleString()}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
