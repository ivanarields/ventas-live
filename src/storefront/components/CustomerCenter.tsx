import React, { useState, useEffect } from 'react';

const BRAND = '#ff2d78';

interface Props {
  onBack: () => void;
}

interface Settings {
  store_name?: string;
  store_phone?: string;
  next_live_date?: string;
  next_live_time?: string;
  delivery_note?: string;
  address?: string;
}

export function CustomerCenter({ onBack }: Props) {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/store/settings')
      .then(r => r.json())
      .then(data => {
        setSettings(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const hasLive = settings.next_live_date && settings.next_live_date.trim() !== '';

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
        <button onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-50">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <h2 className="text-[18px] font-black text-gray-900">Centro de Clientas</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Aviso principal */}
        <div className="bg-gradient-to-r from-[#ff2d78] to-[#ff6fa3] rounded-2xl p-5 text-white">
          <p className="text-[11px] font-black uppercase tracking-widest opacity-80 mb-1">Bienvenida</p>
          <h3 className="text-lg font-black">{settings.store_name || 'Leydi American'}</h3>
          <p className="text-[13px] font-medium opacity-90 mt-1">Moda femenina con estilo y calidad</p>
        </div>

        {/* Proximo Live */}
        {hasLive ? (
          <div className="bg-purple-50 rounded-2xl p-4 border border-purple-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🎥</span>
              <p className="text-[11px] font-black text-purple-600 uppercase tracking-wider">Proximo Live</p>
            </div>
            <p className="text-[16px] font-black text-gray-900">
              {new Date(settings.next_live_date!).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            {settings.next_live_time && (
              <p className="text-[14px] font-bold text-purple-600">{settings.next_live_time}</p>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-[13px] font-bold text-gray-400">No hay Live programado aun</p>
          </div>
        )}

        {/* Direccion */}
        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">📍</span>
            <p className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Direccion</p>
          </div>
          <p className="text-[14px] font-bold text-gray-800 leading-relaxed">
            {settings.address || 'Consulta por WhatsApp'}
          </p>
        </div>

        {/* Entregas */}
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🚚</span>
            <p className="text-[11px] font-black text-blue-600 uppercase tracking-wider">Entregas</p>
          </div>
          <p className="text-[14px] font-bold text-gray-800 leading-relaxed">
            {settings.delivery_note || 'Entregas de lunes a sabado'}
          </p>
        </div>

        {/* FAQ rapida */}
        <div className="space-y-3">
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider px-1">Preguntas frecuentes</p>

          {[
            { q: 'Como compro?', a: 'Elige productos, agrega al carrito, confirma tu pedido y paga con QR.' },
            { q: 'Como pago?', a: 'Recibimos pagos por QR (Yape) o transferencia bancaria.' },
            { q: 'Cuando entregan?', a: 'Las entregas son segun el dia y horario que elijas al comprar.' },
            { q: 'Puedo retirar?', a: 'Si, puedes elegir retiro en tienda al momento de la compra.' },
            { q: 'Tengo un problema con mi pedido', a: 'Escribenos por WhatsApp y te ayudamos de inmediato.' },
          ].map((faq, idx) => (
            <details key={idx} className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <summary className="px-4 py-3 text-[13px] font-black text-gray-800 cursor-pointer list-none flex items-center justify-between">
                {faq.q}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6"/></svg>
              </summary>
              <p className="px-4 pb-3 text-[12px] text-gray-500 font-medium leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>

        {/* Boton WhatsApp */}
        <a
          href={`https://wa.me/${settings.store_phone || '59160003230'}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl font-black text-white text-[15px] shadow-lg active:scale-[0.98] transition-all"
          style={{ background: '#25D366' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-4.869 1.176l-.348.213-3.613-.952.969 3.536-.235.365a9.847 9.847 0 001.517 5.585c.618.987 1.523 1.87 2.583 2.543 1.324.744 2.787 1.114 4.276 1.114 2.419 0 4.687-.891 6.389-2.528.998-.943 1.843-2.111 2.489-3.415.646-1.304 1.08-2.722 1.273-4.167.024-.158.036-.315.036-.474 0-2.685-1.068-5.21-3.007-7.115-1.939-1.905-4.542-2.96-7.297-2.96z"/></svg>
          Escribir por WhatsApp
        </a>
      </div>
    </div>
  );
}
