import React, { useEffect, useState } from 'react';
import { Check, ImageIcon, Loader2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

const BRAND = '#ff2d78';

export interface OrderChatPhoto {
  id: string;
  media_url: string;
  thumb_url?: string;
  media_type: string | null;
  tipo?: string | null;
  direction: string;
  created_at: string;
  content: string | null;
  descripcion?: string | null;
  selected_by_ai?: boolean;
  selected_final?: boolean;
  selection_source?: string | null;
  selected?: boolean;
}

interface Props {
  phone: string;
  orderDate?: string;
  mainPedidoId?: string | number | null;
  days?: number;
  editable?: boolean;
  showComprobantes?: boolean;
  onSelectionChange?: (photos: OrderChatPhoto[], contextoVisual: string | null) => void;
}

interface PhotosResponse {
  photos: OrderChatPhoto[];
  contexto_visual: string | null;
  timeline_steps: string[];
}

interface PhotosRequest {
  phone: string;
  orderDate?: string;
  mainPedidoId?: string | number | null;
  days?: number;
}

const CACHE_TTL_MS = 45_000;
const photosCache = new Map<string, { expiresAt: number; data: PhotosResponse }>();
const inflightRequests = new Map<string, Promise<PhotosResponse>>();

function buildPhotosPath({ phone, orderDate, mainPedidoId, days = 4 }: PhotosRequest) {
  const params = new URLSearchParams({ phone, days: String(days) });
  if (orderDate) params.set('date', orderDate);
  if (mainPedidoId != null) params.set('mainPedidoId', String(mainPedidoId));
  return `/api/identity/whatsapp-photos?${params.toString()}`;
}

function thumbnailUrl(mediaUrl: string) {
  if (!mediaUrl.includes('/storage/v1/object/public/')) return mediaUrl;
  try {
    const url = new URL(mediaUrl);
    url.pathname = url.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
    url.searchParams.set('width', '240');
    url.searchParams.set('height', '320');
    url.searchParams.set('resize', 'cover');
    url.searchParams.set('quality', '55');
    return url.toString();
  } catch {
    return mediaUrl;
  }
}

function normalizePhotosResponse(data: any): PhotosResponse {
  const photos = (Array.isArray(data?.photos) ? data.photos : []).map((photo: OrderChatPhoto) => ({
    ...photo,
    thumb_url: thumbnailUrl(photo.media_url),
  }));
  return {
    photos,
    contexto_visual: data?.contexto_visual ?? null,
    timeline_steps: Array.isArray(data?.timeline_steps)
      ? data.timeline_steps.map((step: unknown) => String(step ?? '').trim()).filter(Boolean).slice(0, 4)
      : [],
  };
}

function warmThumbs(photos: OrderChatPhoto[]) {
  if (typeof Image === 'undefined') return;
  for (const photo of photos.slice(0, 8)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = photo.thumb_url ?? photo.media_url;
  }
}

async function fetchOrderChatPhotos(request: PhotosRequest): Promise<PhotosResponse> {
  const path = buildPhotosPath(request);
  const cached = photosCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const existing = inflightRequests.get(path);
  if (existing) return existing;

  const promise = apiFetch(path)
    .then((data) => {
      const normalized = normalizePhotosResponse(data);
      photosCache.set(path, { expiresAt: Date.now() + CACHE_TTL_MS, data: normalized });
      warmThumbs(normalized.photos);
      return normalized;
    })
    .finally(() => {
      inflightRequests.delete(path);
    });

  inflightRequests.set(path, promise);
  return promise;
}

export function prefetchOrderChatPhotos(request: PhotosRequest) {
  if (!request.phone) return;
  fetchOrderChatPhotos(request).catch(() => undefined);
}

function isComprobantePhoto(photo: OrderChatPhoto) {
  if (photo.tipo === 'comprobante') return true;
  const desc = String(photo.descripcion ?? '').toUpperCase();
  return desc.includes(' BS') || desc.includes('YAPE') || desc.includes('COMPROBANTE');
}

function photoDate(value: string) {
  return new Date(value).toLocaleString('es-BO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OrderChatPhotoSelector({
  phone,
  orderDate,
  mainPedidoId,
  days = 4,
  editable = true,
  showComprobantes = false,
  onSelectionChange,
}: Props) {
  const [photos, setPhotos] = useState<OrderChatPhoto[]>([]);
  const [contextoVisual, setContextoVisual] = useState<string | null>(null);
  const [timelineSteps, setTimelineSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState<OrderChatPhoto | null>(null);

  useEffect(() => {
    if (!phone) return;
    let cancelled = false;
    setLoading(true);

    fetchOrderChatPhotos({ phone, orderDate, mainPedidoId, days })
      .then((data) => {
        if (cancelled) return;
        const next = data.photos.map((photo: OrderChatPhoto) => ({
          ...photo,
          selected: !isComprobantePhoto(photo) && photo.selected_final === true,
        }));
        setPhotos(next);
        setContextoVisual(data.contexto_visual);
        setTimelineSteps(data.timeline_steps);
        onSelectionChange?.(next.filter((photo: OrderChatPhoto) => !isComprobantePhoto(photo)), data.contexto_visual);
      })
      .catch(() => {
        if (!cancelled) {
          setPhotos([]);
          setContextoVisual(null);
          setTimelineSteps([]);
          onSelectionChange?.([], null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [phone, orderDate, days, mainPedidoId]);

  const toggle = (id: string) => {
    if (!editable) return;
    setPhotos(prev => {
      const next = prev.map(photo => photo.id === id ? { ...photo, selected: !photo.selected } : photo);
      onSelectionChange?.(next.filter((photo: OrderChatPhoto) => !isComprobantePhoto(photo)), contextoVisual);
      return next;
    });
  };

  const prendas = photos.filter(photo => !isComprobantePhoto(photo));
  const comprobantes = photos.filter(photo => isComprobantePhoto(photo));
  const selectedCount = prendas.filter(p => p.selected).length;
  const aiCount = prendas.filter(p => p.selected_by_ai).length;

  if (!phone) {
    return (
      <div className="space-y-2">
        <Header total={0} selected={0} ai={0} />
        <div className="flex h-16 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50">
          <span className="text-[11px] font-bold text-gray-400">Sin número de WhatsApp vinculado</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Header total={0} selected={0} ai={0} />
        <div className="flex h-16 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50">
          <Loader2 size={14} className="animate-spin text-gray-400" />
          <span className="text-[11px] text-gray-400">Buscando fotos y selección IA...</span>
        </div>
      </div>
    );
  }

  if (prendas.length === 0 && (!showComprobantes || comprobantes.length === 0)) {
    return (
      <div className="space-y-2">
        <Header total={0} selected={0} ai={0} />
        <div className="flex h-16 items-center justify-center rounded-2xl border-2 border-dashed border-gray-100 bg-gray-50">
          <span className="text-[11px] text-gray-400">No se encontraron fotos en este período</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Header total={prendas.length} selected={selectedCount} ai={aiCount} />
      {prendas.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {prendas.map((photo) => {
          const selected = photo.selected === true;
          return (
            <button
              key={photo.id}
              type="button"
              onClick={() => toggle(photo.id)}
              onDoubleClick={() => setLightbox(photo)}
              className="relative h-32 w-24 flex-shrink-0 overflow-hidden rounded-2xl border-2 bg-gray-50 transition-all active:scale-95"
              style={{
                borderColor: selected ? BRAND : '#e5e7eb',
                opacity: selected ? 1 : 0.55,
                boxShadow: selected ? '0 8px 20px rgba(255,45,120,0.18)' : 'none',
              }}
              title={editable ? 'Tocar para marcar/desmarcar. Doble toque para ampliar.' : 'Doble toque para ampliar.'}
            >
              <img src={photo.thumb_url ?? photo.media_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              {selected && (
                <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-white shadow"
                  style={{ background: BRAND }}>
                  <Check size={14} strokeWidth={4} />
                </span>
              )}
              {photo.selected_by_ai && (
                <span className="absolute bottom-1 left-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[8px] font-black uppercase"
                  style={{ color: BRAND }}>
                  IA
                </span>
              )}
            </button>
          );
          })}
        </div>
      )}

      {showComprobantes && comprobantes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-violet-600">
            Comprobantes para verificar ({comprobantes.length})
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {comprobantes.map((photo) => (
              <div key={photo.id} className="w-24 flex-shrink-0 space-y-1">
                <button
                  type="button"
                  onClick={() => setLightbox(photo)}
                  className="relative h-28 w-24 overflow-hidden rounded-2xl border-2 border-violet-200 bg-gray-50"
                  title="Ver comprobante"
                >
                  <img src={photo.thumb_url ?? photo.media_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                </button>
                <button
                  type="button"
                  onClick={() => setLightbox(photo)}
                  className="w-full rounded-xl bg-violet-50 py-1 text-[10px] font-black text-violet-700 border border-violet-200"
                >
                  Ver comprobante
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(timelineSteps.length > 0 || contextoVisual) && (
        <div className="rounded-2xl border border-pink-100 bg-pink-50 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: BRAND }}>Resumen del chat</p>
          {timelineSteps.length > 0 ? (
            <div className="mt-1 space-y-1.5">
              {timelineSteps.map((step, idx) => (
                <p key={idx} className="text-[11px] font-semibold leading-relaxed text-gray-700">{step}</p>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-gray-600">{contextoVisual}</p>
          )}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/90 p-4" onClick={() => setLightbox(null)}>
          <button type="button" onClick={() => setLightbox(null)} className="absolute right-4 top-4 text-white/70 hover:text-white">
            <X size={24} />
          </button>
          <div className="flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
            <img src={lightbox.media_url} alt="" className="max-h-[82vh] max-w-[92vw] rounded-2xl object-contain" />
            <p className="text-xs text-white/60">{photoDate(lightbox.created_at)}</p>
            {lightbox.descripcion && <p className="max-w-xs text-center text-xs text-white/70">{lightbox.descripcion}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ total, selected, ai }: { total: number; selected: number; ai: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <ImageIcon size={13} className="text-pink-500" />
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">Fotos del pedido</span>
        {total > 0 && <span className="text-[10px] text-gray-400">{selected} de {total} seleccionadas</span>}
      </div>
      {ai > 0 && (
        <span className="rounded-full bg-pink-50 px-2 py-1 text-[9px] font-black uppercase" style={{ color: BRAND }}>
          IA marcó {ai}
        </span>
      )}
    </div>
  );
}
