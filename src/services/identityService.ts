/**
 * identityService.ts
 * Lógica de matching y gestión de perfiles unificados.
 *
 * Reglas (sin IA):
 *  1. Teléfono exacto → match definitivo
 *  2. Nombre normalizado exacto → match probable (confidence 0.85)
 *  3. Nombre parcial (≥2 palabras coinciden) → match posible (confidence 0.6)
 *  4. Sin coincidencia → perfil nuevo
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface IdentityProfile {
  id: string;
  user_id: string;
  display_name: string;
  phone: string | null;
  cliente_id: number | null;
  store_phone: string | null;
  panel_phone: string | null;
  confidence: number;
  origin: 'auto' | 'manual';
  merged_from: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface IdentityEvidence {
  id: string;
  user_id: string;
  profile_id: string | null;
  source: 'manual_payment' | 'macrodroid' | 'whatsapp' | 'store_order';
  source_id: string | null;
  source_ref: string | null;
  event_type: string;
  amount: number | null;
  phone: string | null;
  name_raw: string | null;
  name_normalized: string | null;
  event_at: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface EvidenceInput {
  source: IdentityEvidence['source'];
  source_id?: string;
  source_ref?: string;
  event_type: string;
  amount?: number;
  phone?: string;
  name_raw?: string;
  event_at?: string;
  payload?: Record<string, unknown>;
}

export interface MatchResult {
  profile: IdentityProfile;
  confidence: number;
  match_type: 'phone_exact' | 'name_exact' | 'name_partial' | 'new';
}

// ── Normalización ──────────────────────────────────────────────────────────────

export function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // Bolivia: 8 dígitos → agregar +591
  if (digits.length === 8) return `+591${digits}`;
  // Ya tiene código de país
  if (digits.length >= 10) return `+${digits}`;
  return phone.trim();
}

// ── Matching ───────────────────────────────────────────────────────────────────

function wordOverlap(a: string, b: string): number {
  const wordsA = a.split(' ').filter(Boolean);
  const wordsB = new Set(b.split(' ').filter(Boolean));
  if (wordsA.length === 0) return 0;
  const matches = wordsA.filter(w => wordsB.has(w)).length;
  return matches / wordsA.length;
}

export async function findOrCreateProfile(
  supabase: SupabaseClient,
  userId: string,
  input: { name?: string; phone?: string; clienteId?: number; origin?: 'auto' | 'manual' }
): Promise<MatchResult> {
  const phone = input.phone ? normalizePhone(input.phone) : null;
  const nameNorm = input.name ? normalizeName(input.name) : null;

  // 1. Buscar por teléfono exacto
  if (phone) {
    const { data } = await supabase
      .from('identity_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('phone', phone)
      .limit(1)
      .single();
    if (data) return { profile: data, confidence: 1.0, match_type: 'phone_exact' };
  }

  // 2. Buscar por cliente_id (si viene del sistema de casilleros)
  if (input.clienteId) {
    const { data } = await supabase
      .from('identity_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('cliente_id', input.clienteId)
      .limit(1)
      .single();
    if (data) return { profile: data, confidence: 1.0, match_type: 'phone_exact' };
  }

  // 3. Buscar por nombre normalizado exacto
  if (nameNorm) {
    const { data: profiles } = await supabase
      .from('identity_profiles')
      .select('*')
      .eq('user_id', userId);

    if (profiles?.length) {
      // Nombre exacto
      const exactMatch = profiles.find(p => normalizeName(p.display_name) === nameNorm);
      if (exactMatch) return { profile: exactMatch, confidence: 0.85, match_type: 'name_exact' };

      // Nombre parcial (≥75% de palabras coinciden, mínimo 2 palabras)
      const words = nameNorm.split(' ').filter(Boolean);
      if (words.length >= 2) {
        let bestMatch: IdentityProfile | null = null;
        let bestScore = 0;
        for (const p of profiles) {
          const score = wordOverlap(nameNorm, normalizeName(p.display_name));
          if (score >= 0.75 && score > bestScore) {
            bestScore = score;
            bestMatch = p;
          }
        }
        if (bestMatch) {
          return { profile: bestMatch, confidence: Math.round(bestScore * 0.6 * 1000) / 1000, match_type: 'name_partial' };
        }
      }
    }
  }

  // 4. Crear perfil nuevo
  const { data: newProfile, error } = await supabase
    .from('identity_profiles')
    .insert({
      user_id: userId,
      display_name: input.name ?? (phone ?? 'Sin nombre'),
      phone,
      cliente_id: input.clienteId ?? null,
      confidence: 1.0,
      origin: input.origin ?? 'auto',
    })
    .select()
    .single();

  if (error || !newProfile) throw new Error(`Error creando perfil: ${error?.message}`);
  return { profile: newProfile, confidence: 1.0, match_type: 'new' };
}

// ── Depositar evidencia ────────────────────────────────────────────────────────

export async function depositEvidence(
  supabase: SupabaseClient,
  userId: string,
  profileId: string,
  input: EvidenceInput
): Promise<IdentityEvidence> {
  const nameNorm = input.name_raw ? normalizeName(input.name_raw) : null;
  const phone = input.phone ? normalizePhone(input.phone) : null;

  const { data, error } = await supabase
    .from('identity_evidence')
    .insert({
      user_id: userId,
      profile_id: profileId,
      source: input.source,
      source_id: input.source_id ?? null,
      source_ref: input.source_ref ?? null,
      event_type: input.event_type,
      amount: input.amount ?? null,
      phone,
      name_raw: input.name_raw ?? null,
      name_normalized: nameNorm,
      event_at: input.event_at ?? new Date().toISOString(),
      payload: input.payload ?? {},
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Error depositando evidencia: ${error?.message}`);
  return data;
}

// ── Helpers de consulta ────────────────────────────────────────────────────────

export async function getProfileWithEvidence(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<{ profile: IdentityProfile; evidence: IdentityEvidence[] } | null> {
  const [{ data: profile }, { data: evidence }] = await Promise.all([
    supabase.from('identity_profiles').select('*').eq('id', profileId).eq('user_id', userId).single(),
    supabase.from('identity_evidence').select('*').eq('profile_id', profileId).eq('user_id', userId).order('event_at', { ascending: false }),
  ]);
  if (!profile) return null;
  return { profile, evidence: evidence ?? [] };
}

export async function listProfiles(
  supabase: SupabaseClient,
  userId: string,
  opts?: { limit?: number; offset?: number; search?: string; source?: string }
): Promise<IdentityProfile[]> {
  // Si hay filtro por canal, primero obtenemos los profile_ids que tienen evidencia de ese canal
  if (opts?.source) {
    const { data: evidenceRows } = await supabase
      .from('identity_evidence')
      .select('profile_id')
      .eq('user_id', userId)
      .eq('source', opts.source);
    const ids = [...new Set((evidenceRows ?? []).map(e => e.profile_id).filter(Boolean))];
    if (ids.length === 0) return [];
    const { data } = await supabase
      .from('identity_profiles')
      .select('*')
      .eq('user_id', userId)
      .in('id', ids)
      .order('updated_at', { ascending: false });
    return data ?? [];
  }

  let query = supabase
    .from('identity_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (opts?.search) query = query.ilike('display_name', `%${opts.search}%`);
  if (opts?.limit) query = query.limit(opts.limit);
  if (opts?.offset) query = query.range(opts.offset, (opts.offset + (opts.limit ?? 50)) - 1);

  const { data } = await query;
  return data ?? [];
}

// ── Recálculo de confianza ─────────────────────────────────────────────────────
// Fórmula basada en el flujo real del negocio:
//   - WhatsApp es el canal central (da teléfono + contacto directo)
//   - Cada canal adicional confirma la identidad de forma independiente
//
// Tabla de resultados:
//   Solo manual (sin tel)  → 30%  (rojo)
//   Solo MacroDroid        → 45%  (rojo)
//   Solo WhatsApp          → 60%  (amarillo)
//   WhatsApp + 1 canal     → 85%  (verde)
//   WhatsApp + 2 canales   → 97%  (verde)

export async function recalculateAllConfidences(
  supabase: SupabaseClient,
  userId: string
): Promise<{ updated: number }> {
  const [{ data: profiles }, { data: evidence }] = await Promise.all([
    supabase.from('identity_profiles').select('id, phone, panel_phone, store_phone').eq('user_id', userId),
    supabase.from('identity_evidence').select('profile_id, source').eq('user_id', userId).not('profile_id', 'is', null),
  ]);

  if (!profiles?.length) return { updated: 0 };

  // Agrupar fuentes por perfil
  const sourcesByProfile = new Map<string, Set<string>>();
  for (const e of evidence ?? []) {
    if (!e.profile_id) continue;
    if (!sourcesByProfile.has(e.profile_id)) sourcesByProfile.set(e.profile_id, new Set());
    sourcesByProfile.get(e.profile_id)!.add(e.source);
  }

  let updated = 0;
  for (const profile of profiles) {
    const sources = sourcesByProfile.get(profile.id) ?? new Set<string>();
    const hasWhatsapp = sources.has('whatsapp');
    const hasPhone = !!(profile.phone || profile.panel_phone || profile.store_phone);
    const otherChannels = [...sources].filter(s => s !== 'whatsapp').length;

    let confidence: number;

    if (hasWhatsapp && otherChannels >= 2) {
      confidence = 0.97;
    } else if (hasWhatsapp && otherChannels >= 1) {
      confidence = 0.85;
    } else if (hasWhatsapp) {
      confidence = 0.60;
    } else if (sources.has('macrodroid')) {
      confidence = 0.45;
    } else if (hasPhone) {
      // tiene teléfono pero no WhatsApp (ej: solo tienda con número)
      confidence = 0.55;
    } else {
      // solo pago manual sin teléfono
      confidence = 0.30;
    }

    await supabase
      .from('identity_profiles')
      .update({ confidence })
      .eq('id', profile.id)
      .eq('user_id', userId);

    updated++;
  }

  return { updated };
}

// ── Ingesta desde pagos manuales ───────────────────────────────────────────────
// Llamar desde el endpoint POST /api/pagos cuando se registra un pago.

export async function ingestManualPayment(
  supabase: SupabaseClient,
  userId: string,
  pago: { id: string; nombre: string; monto: number; fecha?: string; clienteId?: number }
): Promise<MatchResult> {
  const result = await findOrCreateProfile(supabase, userId, {
    name: pago.nombre,
    clienteId: pago.clienteId,
  });

  await depositEvidence(supabase, userId, result.profile.id, {
    source: 'manual_payment',
    source_id: pago.id,
    event_type: 'payment',
    amount: pago.monto,
    name_raw: pago.nombre,
    event_at: pago.fecha,
    payload: { cliente_id: pago.clienteId },
  });

  return result;
}
