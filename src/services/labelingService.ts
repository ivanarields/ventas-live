import { supabase, type StorageContainer, type AllocationRow } from "../lib/supabase";

// ============================================================================
// Bridge Firebase ↔ Supabase
// Sincroniza un cliente y su pedido desde Firebase a Supabase, devolviendo
// la etiqueta (container_code) asignada. Esta es la función clave que reemplaza
// al viejo LabelEngine.processCustomer.
// ============================================================================

export interface SyncPedidoResult {
  /** Código de casillero asignado por Supabase (ej: "1", "A") */
  containerCode: string;
  /** ID numérico del pedido en Supabase */
  orderId: number;
  /** True si este cambio disparó migración SIMPLE→COMPLEX */
  wasMigrated: boolean;
}

export interface SyncPedidoInput {
  /** customerId de Firebase (doc id de la colección customers) */
  firebaseCustomerId: string;
  customerName: string;
  customerNormalizedName: string;
  customerWhatsApp?: string | null;
  /** firebase doc id del pedido */
  firebasePedidoId: string;
  totalBags: number;
  totalItems: number;
  totalAmount?: number;
  assignedBy?: string;
}

/**
 * Sincroniza un pedido de Firebase a Supabase y asigna/actualiza su casillero.
 * - Si el cliente no existe en Supabase, lo crea (por firebase_id).
 * - Si el pedido no existe, lo crea y asigna casillero.
 * - Si ya existe y cambió de SIMPLE a COMPLEX, migra automáticamente.
 * - Si ya existe y no cambió la clasificación, actualiza y mantiene la etiqueta.
 */
export async function syncPedidoLabel(input: SyncPedidoInput): Promise<SyncPedidoResult> {
  // 1. Upsert cliente
  const { data: customerIdData, error: customerErr } = await supabase.rpc("fn_upsert_customer", {
    p_firebase_id: input.firebaseCustomerId,
    p_full_name: input.customerName,
    p_normalized_name: input.customerNormalizedName,
    p_whatsapp_number: input.customerWhatsApp ?? null,
  });
  if (customerErr) throw new Error(`upsert customer: ${customerErr.message}`);
  const customerId = customerIdData as unknown as number;

  // 2. Upsert pedido + asignación
  const { data, error } = await supabase.rpc("fn_upsert_order_and_assign", {
    p_firebase_id: input.firebasePedidoId,
    p_customer_id: customerId,
    p_total_bags: input.totalBags,
    p_total_items: input.totalItems,
    p_total_amount: input.totalAmount ?? 0,
    p_assigned_by: input.assignedBy ?? "app",
  });
  if (error) throw new Error(`upsert order: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  return {
    containerCode: row.out_container_code,
    orderId: row.out_order_id,
    wasMigrated: row.out_was_migrated ?? false,
  };
}

/**
 * Libera el casillero cuando un pedido se entrega o se elimina.
 * Identifica el pedido por su firebase_id.
 */
export async function releasePedidoLabel(
  firebasePedidoId: string,
  reason: "DELIVERED" | "CANCELLED" | "DELETED" = "DELIVERED"
): Promise<void> {
  const { error } = await supabase.rpc("fn_release_order_by_firebase_id", {
    p_firebase_id: firebasePedidoId,
    p_released_by: "app",
    p_reason: reason,
  });
  if (error) throw new Error(`release order: ${error.message}`);
}

// ============================================================================
// Consultas auxiliares (para paneles o depuración)
// ============================================================================

export async function getContainersPanel(): Promise<StorageContainer[]> {
  const { data, error } = await supabase
    .from("storage_containers")
    .select("*")
    .order("priority_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getAllocationHistory(orderId: number): Promise<AllocationRow[]> {
  const { data, error } = await supabase
    .from("container_allocations")
    .select("*")
    .eq("order_id", orderId)
    .order("assigned_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCurrentLabelByFirebaseId(firebasePedidoId: string): Promise<string | null> {
  const { data } = await supabase
    .from("orders")
    .select("id, container_allocations!inner(storage_containers!inner(container_code))")
    .eq("firebase_id", firebasePedidoId)
    .eq("container_allocations.status", "ACTIVE")
    .maybeSingle();
  // @ts-expect-error relación anidada
  return data?.container_allocations?.[0]?.storage_containers?.container_code ?? null;
}
