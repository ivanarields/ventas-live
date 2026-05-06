import React, { useState, useEffect } from 'react';

const BRAND = '#ff2d78';

interface Photo {
  url: string;
  id: string;
}

export default function SelectionConfirmation() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) {
      setToken(t);
      loadRequest(t);
    } else {
      setLoading(false);
      setError('Link invalido. Solicita uno nuevo.');
    }
  }, []);

  const loadRequest = async (t: string) => {
    try {
      const res = await fetch(`/api/store/selection/${t}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');

      const req = json.request;
      setCustomerName(req.customer_name || '');
      setPhotos((req.candidate_photos || []).map((url: string, idx: number) => ({ url, id: String(idx) })));

      // Pre-seleccionar sugerencias IA si existen
      const suggested = req.suggested_items || [];
      if (suggested.length > 0) {
        setSelectedIds(suggested.map((_: any, idx: number) => String(idx)));
      }
    } catch (err: any) {
      setError(err.message || 'No se pudo cargar el link.');
    } finally {
      setLoading(false);
    }
  };

  const togglePhoto = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleConfirm = async () => {
    if (selectedIds.length === 0) {
      setError('Selecciona al menos una prenda o usa "Ninguna es correcta".');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const selectedItems = selectedIds.map(id => {
        const photo = photos.find(p => p.id === id);
        return { id, url: photo?.url };
      });

      const res = await fetch(`/api/store/selection/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_items: selectedItems, notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      setSuccess('Prendas confirmadas. Gracias!');
    } catch (err: any) {
      setError(err.message || 'Error al confirmar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/store/selection/${token}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error');
      setSuccess('Respuesta registrada. Te contactaremos.');
    } catch (err: any) {
      setError(err.message || 'Error al registrar.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: '#d1fae5' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Listo!</h1>
        <p className="text-gray-500 text-sm">{success}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-5 py-8">
        <h1 className="text-xl font-black text-gray-900 mb-1">Confirma tus prendas</h1>
        <p className="text-sm text-gray-400 mb-6">
          {customerName ? `Hola ${customerName},` : 'Hola,'} selecciona las prendas que correspondan a tu pedido.
        </p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm font-bold rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          {photos.map(photo => {
            const isSelected = selectedIds.includes(photo.id);
            return (
              <button
                key={photo.id}
                onClick={() => togglePhoto(photo.id)}
                className={`relative aspect-[3/4] rounded-2xl overflow-hidden border-2 transition-all active:scale-95 ${
                  isSelected ? 'border-[#ff2d78] ring-4 ring-pink-100' : 'border-transparent shadow-sm'
                }`}
              >
                <img src={photo.url} alt="" className="w-full h-full object-cover" />
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

        {photos.length === 0 && !error && (
          <div className="text-center py-10 text-gray-400">
            <p className="font-bold">No hay fotos para mostrar.</p>
          </div>
        )}

        <div className="mb-6">
          <label className="text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5 block">
            Nota opcional
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Si algo no coincide, escribelo aqui..."
            className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm font-medium outline-none border border-gray-100 focus:border-pink-300 resize-none"
            rows={3}
          />
        </div>

        <div className="space-y-3">
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full h-14 rounded-2xl font-black text-white text-[15px] shadow-lg active:scale-[0.98] disabled:opacity-50 transition-all"
            style={{ background: `linear-gradient(135deg, ${BRAND}, #ff6fa3)` }}
          >
            {submitting ? 'Guardando...' : 'Confirmar seleccion'}
          </button>

          <button
            onClick={handleReject}
            disabled={submitting}
            className="w-full h-12 rounded-2xl font-black text-[14px] text-gray-500 bg-gray-100 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            Ninguna es correcta
          </button>
        </div>

        <p className="text-[11px] text-gray-300 text-center mt-6 font-medium">
          Leydi American — Tienda Online
        </p>
      </div>
    </div>
  );
}
