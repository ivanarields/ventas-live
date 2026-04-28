import React, { useState, useEffect } from 'react';
import { storeAuth } from '../services/storeAuth';

const BRAND = '#ff2d78';

interface Photo {
  id: number;
  media_url: string;
  media_type: string;
  created_at: string;
  content?: string;
}

interface Props {
  onBack: () => void;
}

export function LiveConfirmation({ onBack }: Props) {
  const [session, setSession] = useState(storeAuth.getCurrentUserSync());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Formulario de identificación (si no hay sesión)
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    if (session) {
      loadPhotos(session.phone);
    }
  }, [session]);

  const loadPhotos = async (phone: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/store/whatsapp-photos?phone=${phone}`);
      if (!res.ok) throw new Error('Error al cargar fotos');
      const data = await res.json();
      setPhotos(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    const cleanPhone = phone.trim().replace(/\D/g, '');
    if (cleanPhone.length < 8) { setError('Número de WhatsApp inválido'); return; }
    if (pin.length !== 4) { setError('El PIN debe tener 4 dígitos'); return; }

    setAuthLoading(true);
    setError('');
    try {
      const res = await fetch('/api/store-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, pin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PIN incorrecto');

      const userSession = { id: data.user.id, phone: cleanPhone, name: '', token: data.session.access_token };
      storeAuth.saveSession(userSession.token, userSession);
      setSession(userSession);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      // En un caso real, aquí crearíamos un pedido especial de Live.
      // Por ahora, simulamos el éxito.
      await new Promise(r => setTimeout(r, 1500));
      setSubmitted(true);
    } catch (err: any) {
      setError('Error al confirmar prendas');
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="flex flex-col min-h-screen bg-white">
        <div className="p-6 pt-12 text-center">
          <div className="w-20 h-20 bg-pink-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">👗</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">Confirmar Live</h1>
          <p className="text-gray-400 text-sm">Ingresa con tu PIN para ver tus prendas del TikTok Live.</p>
        </div>

        <div className="px-6 space-y-4">
          <div>
            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">WhatsApp</label>
            <input
              type="tel" placeholder="60001234"
              value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full px-4 py-3.5 bg-gray-50 rounded-xl font-bold border-none outline-none focus:ring-2 focus:ring-pink-200"
            />
          </div>
          <div>
            <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">PIN</label>
            <input
              type="password" placeholder="••••" maxLength={4}
              value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3.5 bg-gray-50 rounded-xl font-bold border-none outline-none focus:ring-2 focus:ring-pink-200 text-center tracking-widest"
            />
          </div>
          {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={authLoading}
            className="w-full py-4 bg-[#ff2d78] text-white font-black rounded-2xl shadow-lg shadow-pink-200 active:scale-95 transition-all disabled:opacity-50"
          >
            {authLoading ? 'Verificando...' : 'Ingresar'}
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col min-h-screen bg-white items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">¡Prendas Confirmadas!</h2>
        <p className="text-gray-500 text-sm mb-8">
          Hemos recibido tu selección. El operador procesará tu pedido en breve. ✨
        </p>
        <button
          onClick={onBack}
          className="w-full max-w-xs py-4 bg-[#ff2d78] text-white font-black rounded-2xl shadow-lg"
        >
          Volver a la tienda
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md px-5 py-4 flex items-center justify-between border-b border-gray-50">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-50">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div>
            <h2 className="text-[15px] font-black text-gray-900">Mis prendas (Live)</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">TikTok Live</p>
          </div>
        </div>
        <div className="bg-pink-50 text-[#ff2d78] px-3 py-1 rounded-full text-[10px] font-black">
          {selectedIds.length} seleccionadas
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && photos.length === 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="aspect-[3/4] bg-gray-50 animate-pulse rounded-2xl" />)}
          </div>
        ) : photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">📸</div>
            <p className="text-sm font-bold text-gray-800">No encontramos fotos de WhatsApp</p>
            <p className="text-xs text-gray-400 mt-1">Asegúrate de haber enviado las capturas al WhatsApp de la tienda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-24">
            {photos.map(photo => {
              const isSelected = selectedIds.includes(photo.id);
              return (
                <button
                  key={photo.id}
                  onClick={() => toggleSelect(photo.id)}
                  className={`relative aspect-[3/4] rounded-2xl overflow-hidden border-2 transition-all active:scale-95 ${
                    isSelected ? 'border-[#ff2d78] ring-4 ring-pink-100' : 'border-transparent shadow-sm'
                  }`}
                >
                  <img src={photo.media_url} alt="" className="w-full h-full object-cover" />
                  <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                    isSelected ? 'bg-[#ff2d78] border-[#ff2d78]' : 'bg-black/20 border-white'
                  }`}>
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Fijo */}
      {photos.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-5 bg-white/90 backdrop-blur-xl border-t border-gray-100 z-30 max-w-[430px] mx-auto sm:rounded-b-[40px]">
          <button
            onClick={handleSubmit}
            disabled={selectedIds.length === 0 || loading}
            className="w-full h-14 bg-[#ff2d78] text-white font-black rounded-2xl shadow-xl shadow-pink-200 flex items-center justify-center gap-3 disabled:opacity-40 transition-all active:scale-[0.98]"
          >
            {loading ? 'Confirmando...' : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Confirmar prendas
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
