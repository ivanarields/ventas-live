import React, { useState } from 'react';
import { motion } from 'motion/react';

/**
 * FOCUS CLONE KIT: PaymentHistoryTape
 * Sector: Historial de Pagos con Scroll Magnético y Enfoque Dinámico
 */

interface Payment {
  id: string;
  time: string; // Formato esperado: "DD/MM/YYYY HH:mm" o ISO
  amount: number;
  name?: string;
  type?: 'A' | 'B';
  method?: string;
  verificationOrigin?: 'automatic' | 'manual' | 'whatsapp_pending' | 'macrodroid_only' | 'other';
  livePaymentId?: string | null;
}

interface PaymentHistoryTapeProps {
  payments: Payment[];
  onPaymentClick?: (payment: Payment) => void;
}

export const PaymentHistoryTape: React.FC<PaymentHistoryTapeProps> = ({ payments, onPaymentClick }) => {
  const [activePaymentIndex, setActivePaymentIndex] = useState(0);

  // El efecto de "Focus" se activa si hay más de 5 elementos
  const isLargeList = payments.length > 5;

  if (payments.length === 0) return null;

  return (
    <div className="tape-kit-root">
      {/* ESTILOS ENCAPSULADOS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        
        .tape-kit-root {
          font-family: 'Inter', sans-serif;
          position: relative;
          width: 100%;
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: transparent;
        }

        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        .tape-container {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          height: 54px;
          width: 100%;
        }

        .tape-container.has-mask {
          mask-image: linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent);
        }

        .divider-tape {
          width: 1px;
          height: 16px;
          background-color: rgba(255, 255, 255, 0.35);
        }

        .dot-line {
          position: absolute;
          top: 50%; left: 8px; right: 8px;
          height: 1px;
          background-color: rgba(156, 112, 248, 0.25);
          transform: translateY(-50%);
        }
      `}</style>

      {/* Contenedor de Scroll */}
      <div 
        onScroll={(e) => {
          if (!isLargeList) return;
          const container = e.currentTarget;
          const scrollLeft = container.scrollLeft;
          const itemWidth = 65; // Ancho aproximado de cada celda
          const index = Math.round(scrollLeft / itemWidth);
          if (index !== activePaymentIndex && index >= 0 && index < payments.length) {
            setActivePaymentIndex(index);
          }
        }}
        className={`tape-container no-scrollbar ${isLargeList ? 'has-mask' : ''}`}
        style={{ 
          paddingLeft: isLargeList ? '40%' : '12px',
          paddingRight: isLargeList ? '40%' : '12px',
          justifyContent: isLargeList ? 'flex-start' : 'space-around',
          scrollSnapType: isLargeList ? 'x mandatory' : 'none'
        }}
      >
        {payments.map((payment, index) => {
          // Formateo de hora AM/PM
          let formattedTime = '';
          try {
            const dateObj = new Date(payment.time);
            if (!isNaN(dateObj.getTime())) {
              formattedTime = dateObj.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit', hour12: true });
            } else {
              const timePart = payment.time.includes(' ') ? payment.time.split(' ')[1] : payment.time;
              const [h, m] = timePart.split(':').map(Number);
              const ampm = h >= 12 ? 'PM' : 'AM';
              const h12 = h % 12 || 12;
              formattedTime = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
            }
          } catch (e) {
            formattedTime = payment.time;
          }
          
          const isActive = isLargeList ? activePaymentIndex === index : true;
          const origin = payment.verificationOrigin ?? 'other';
          
          // Color lila suave (#a27dfa) y verde de la app (#10b981)
          const accentColor = origin === 'automatic'
            ? '#10b981'
            : origin === 'manual' || origin === 'whatsapp_pending'
              ? '#a27dfa'
              : '#94a3b8';
          const mutedColor = origin === 'automatic'
            ? '#34d399'
            : origin === 'manual' || origin === 'whatsapp_pending'
              ? '#beb2fa'
              : '#cbd5e1';
              
          const label = origin === 'whatsapp_pending'
            ? 'Verificar'
            : origin === 'manual'
            ? 'Manual'
            : origin === 'automatic'
              ? 'Automatico'
              : 'Pendiente';

          return (
            <div 
              key={payment.id} 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, scrollSnapAlign: 'center', minWidth: isLargeList ? '65px' : 'auto' }}
            >
              <button 
                onClick={() => onPaymentClick?.(payment)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.3s ease',
                  transform: isActive ? 'scale(1.05)' : 'scale(0.95)',
                  opacity: isActive ? 1 : 0.4
                }}
              >
                <span style={{ 
                  fontSize: '16px', 
                  fontWeight: 900, 
                  color: isActive ? accentColor : '#94a3b8', 
                  lineHeight: 1,
                  textShadow: isActive ? '0 1px 2px rgba(255, 255, 255, 0.8), 0 0 4px rgba(255, 255, 255, 0.5)' : 'none'
                }}>
                  {payment.amount}
                </span>
                <span style={{ 
                  fontSize: '9px', 
                  color: isActive ? accentColor : '#cbd5e1', 
                  marginTop: '4px', 
                  fontWeight: 900, 
                  textTransform: 'uppercase',
                  textShadow: isActive ? '0 1px 2px rgba(255, 255, 255, 0.8), 0 0 4px rgba(255, 255, 255, 0.5)' : 'none'
                }}>
                  {formattedTime}
                </span>
                {payment.method === 'Tienda Online' && (
                  <span style={{ 
                    marginTop: '4px', 
                    fontSize: '8px', 
                    fontWeight: 900, 
                    color: '#10b981', 
                    background: 'rgba(255, 255, 255, 0.8)', 
                    padding: '2px 6px', 
                    borderRadius: '999px', 
                    textTransform: 'uppercase',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}>
                    WEB
                  </span>
                )}
                <span
                  aria-label={`Pago ${label}`}
                  title={label}
                  style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? accentColor : '#e2e8f0',
                    marginTop: '5px',
                    display: 'block',
                    boxShadow: isActive ? '0 0 2px white' : 'none'
                  }}
                />
              </button>

              {index < payments.length - 1 && !isLargeList && <div className="divider-tape" />}
            </div>
          );
        })}
      </div>

      {/* Indicadores de Puntos Inferiores */}
      {isLargeList && (
        <div style={{ marginTop: '2px', display: 'flex', gap: '12px', position: 'relative', width: '60%', justifyContent: 'center' }}>
          <div className="dot-line" />
          {payments.map((_, idx) => (
            <motion.div 
              key={idx}
              animate={{ 
                scale: activePaymentIndex === idx ? 1.3 : 1,
                backgroundColor: activePaymentIndex === idx ? '#a27dfa' : 'rgba(156, 112, 248, 0.35)'
              }}
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                border: activePaymentIndex === idx ? '1.5px solid white' : '1.5px solid rgba(156, 112, 248, 0.20)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                position: 'relative',
                zIndex: 10
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PaymentHistoryTape;
