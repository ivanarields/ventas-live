import React, { useState, useEffect } from 'react';
import { ImageIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Photo {
  id: string;
  media_url: string;
  media_type: string | null;
  direction: string;
  created_at: string;
  content: string | null;
}

interface Props {
  phone: string;        // teléfono del cliente (con o sin +591)
  orderDate?: string;   // fecha del pedido — centro del rango de búsqueda
  days?: number;        // días a buscar alrededor de la fecha (default 4)
}

async function fetchPhotos(phone: string, date?: string, days = 4): Promise<Photo[]> {
  const session = JSON.parse(localStorage.getItem('sb_session') || '{}');
  const params = new URLSearchParams({ phone, days: String(days) });
  if (date) params.set('date', date);
  const res = await fetch(`/api/identity/whatsapp-photos?${params}`, {
    headers: {
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(session.user?.id ? { 'x-user-id': session.user.id } : {}),
    },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.photos ?? [];
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ photos, index, onClose }: { photos: Photo[]; index: number; onClose: () => void }) {
  const [current, setCurrent] = useState(index);
  const prev = () => setCurrent(i => Math.max(0, i - 1));
  const next = () => setCurrent(i => Math.min(photos.length - 1, i + 1));

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  const photo = photos[current];
  const date = new Date(photo.created_at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/90"
      onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white">
        <X size={24} />
      </button>
      {current > 0 && (
        <button onClick={e => { e.stopPropagation(); prev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/30 rounded-full p-2">
          <ChevronLeft size={22} />
        </button>
      )}
      {current < photos.length - 1 && (
        <button onClick={e => { e.stopPropagation(); next(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/30 rounded-full p-2">
          <ChevronRight size={22} />
        </button>
      )}
      <div className="flex flex-col items-center gap-2 px-12" onClick={e => e.stopPropagation()}>
        <img src={photo.media_url} alt="" className="max-h-[80vh] max-w-[90vw] rounded-xl object-contain" />
        <p className="text-white/50 text-xs">{date} · {current + 1}/{photos.length}</p>
        {photo.content && <p className="text-white/70 text-xs max-w-xs text-center">{photo.content}</p>}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function WhatsappPhotos({ phone, orderDate, days = 4 }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    if (!phone) return;
    setLoading(true);
    fetchPhotos(phone, orderDate, days)
      .then(setPhotos)
      .finally(() => setLoading(false));
  }, [phone, orderDate, days]);

  // ── Cabecera de sección ────────────────────────────────────────────────────
  const header = (
    <div className="flex items-center gap-2">
      <ImageIcon size={13} className="text-green-500" />
      <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest">
        Fotos de WhatsApp
      </span>
      {photos.length > 0 && (
        <span className="text-[10px] text-gray-400">({photos.length}) · ±{days} días</span>
      )}
    </div>
  );

  // Sin teléfono vinculado
  if (!phone) {
    return (
      <div className="space-y-2">
        {header}
        <div className="flex items-center justify-center h-16 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50">
          <span className="text-[11px] text-gray-400 font-bold">Sin número de WhatsApp vinculado</span>
        </div>
      </div>
    );
  }

  // Cargando
  if (loading) {
    return (
      <div className="space-y-2">
        {header}
        <div className="flex items-center justify-center h-16 rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50">
          <span className="text-[11px] text-gray-400">Buscando fotos...</span>
        </div>
      </div>
    );
  }

  // Sin fotos en el período
  if (photos.length === 0) {
    return (
      <div className="space-y-2">
        {header}
        <div className="flex items-center justify-center h-16 rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50">
          <span className="text-[11px] text-gray-400">No se encontraron fotos en este período</span>
        </div>
      </div>
    );
  }

  // Carrusel con fotos
  return (
    <>
      <div className="space-y-2">
        {header}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => setLightbox(i)}
              className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 border-gray-100 hover:border-green-400 transition-colors relative group"
            >
              <img
                src={photo.media_url}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              {photo.direction === 'out' && (
                <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-green-400" title="Enviada por la tienda" />
              )}
            </button>
          ))}
        </div>
      </div>

      {lightbox !== null && (
        <Lightbox photos={photos} index={lightbox} onClose={() => setLightbox(null)} />
      )}
    </>
  );
}
