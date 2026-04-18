/**
 * Shim de compatibilidad Firebase → Supabase API.
 * Mapea la API Firebase Firestore a llamadas REST al servidor Express.
 * Permite migrar gradualmente sin cambiar todos los call-sites de una vez.
 */

let _userId: string | null = null;
export function setCompatUserId(id: string | null) { _userId = id; }

// ─── Tabla → endpoint ────────────────────────────────────────────────────────
const COLLECTION_ENDPOINTS: Record<string, string> = {
  customers: "/api/clientes",
  pagos: "/api/pagos",
  pedidos: "/api/pedidos",
  transactions: "/api/transacciones",
  categories: "/api/categorias",
  live_sessions: "/api/lives",
  ideas: "/api/ideas",
  orders: null as any,    // legacy — silent no-op
  giveaways: null as any, // legacy — silent no-op
};

// Camel→snake para los campos que el server espera
function toServerFields(collection: string, data: Record<string, any>): Record<string, any> {
  if (collection === "customers") {
    const out: any = {};
    if (data.name !== undefined) out.full_name = data.name;
    if (data.canonicalName !== undefined) out.canonical_name = data.canonicalName;
    if (data.phone !== undefined) out.phone = data.phone;
    if (data.activeLabel !== undefined) out.active_label = data.activeLabel;
    if (data.activeLabelType !== undefined) out.active_label_type = data.activeLabelType;
    if (data.totalSpent !== undefined) out.total_spent = data.totalSpent;
    if (data.totalItems !== undefined) out.total_items = data.totalItems;
    if (data.pendingItems !== undefined) out.pending_items = data.pendingItems;
    if (data.deliveredItems !== undefined) out.delivered_items = data.deliveredItems;
    if (data.activeBagCount !== undefined) out.active_bag_count = data.activeBagCount;
    if (data.labelVersion !== undefined) out.label_version = data.labelVersion;
    if (data.labelUpdatedAt !== undefined) out.label_updated_at = data.labelUpdatedAt;
    return out;
  }
  if (collection === "pedidos") {
    const out: any = {};
    if (data.customerId !== undefined) out.customer_id = data.customerId;
    if (data.customerName !== undefined) out.customer_name = data.customerName;
    if (data.itemCount !== undefined) out.item_count = data.itemCount;
    if (data.bagCount !== undefined) out.bag_count = data.bagCount;
    if (data.label !== undefined) out.label = data.label;
    if (data.labelType !== undefined) out.label_type = data.labelType;
    if (data.status !== undefined) out.status = data.status;
    if (data.totalAmount !== undefined) out.total_amount = data.totalAmount;
    if (data.date !== undefined) out.date = data.date;
    if (data.labelVersion !== undefined) out.label_version = data.labelVersion;
    return out;
  }
  if (collection === "pagos") {
    const out: any = {};
    if (data.nombre !== undefined) out.nombre = data.nombre;
    if (data.pago !== undefined) out.pago = data.pago;
    if (data.date !== undefined) out.date = data.date;
    if (data.status !== undefined) out.status = data.status;
    if (data.method !== undefined) out.method = data.method;
    if (data.customerId !== undefined) out.customer_id = data.customerId;
    if (data.nombre !== undefined) out.nombre = data.nombre;
    return { ...data, ...out }; // pass-through for pagos (mostly same field names)
  }
  if (collection === "transactions") {
    const out: any = { ...data };
    if (data.fecha !== undefined) out.fecha = data.fecha instanceof Date ? data.fecha.toISOString() : data.fecha;
    delete out.createdAt; // server handles this
    return out;
  }
  if (collection === "categories") {
    return { name: data.name, type: data.type, icon: data.icon, color: data.color, subcategories: data.subcategories ?? [] };
  }
  if (collection === "live_sessions") {
    return { title: data.title, scheduled_at: data.scheduledAt, duration: data.duration, status: data.status, notes: data.notes };
  }
  return data;
}

async function apiCall(method: string, endpoint: string, body?: any) {
  if (!endpoint) return null; // silent no-op for legacy collections
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_userId) headers["x-user-id"] = _userId;
  const res = await fetch(endpoint, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status} ${endpoint}`);
  }
  return res.json().catch(() => null);
}

// ─── Tipos mínimos ────────────────────────────────────────────────────────────
export interface CollectionRef { _col: string }
export interface DocRef { _col: string; _id: string }
export interface QueryRef { _col: string; _filters?: any[] }
export type QueryConstraint = { _type: string; _args: any[] }

export const db: any = {}; // dummy — no se usa directamente

export const collection = (_db: any, name: string): CollectionRef => ({ _col: name });

export const doc = (_db: any, colName: string, id: string): DocRef => ({ _col: colName, _id: String(id) });

export const serverTimestamp = () => new Date().toISOString();

export const increment = (n: number) => n; // Supabase maneja incrementos en el server

export const Timestamp = {
  fromDate: (d: Date) => d.toISOString(),
  now: () => new Date().toISOString(),
};

export const where = (field: string, op: string, val: any): QueryConstraint => ({ _type: "where", _args: [field, op, val] });
export const orderBy = (field: string, dir = "asc"): QueryConstraint => ({ _type: "orderBy", _args: [field, dir] });
export const limit = (n: number): QueryConstraint => ({ _type: "limit", _args: [n] });
export const query = (ref: CollectionRef, ...constraints: QueryConstraint[]): QueryRef => ({ _col: ref._col, _filters: constraints });

export const addDoc = async (ref: CollectionRef, data: any): Promise<{ id: string }> => {
  const endpoint = COLLECTION_ENDPOINTS[ref._col];
  if (!endpoint) { console.warn("[compat] addDoc ignorado para colección legacy:", ref._col); return { id: `noop-${Date.now()}` }; }
  const body = toServerFields(ref._col, data);
  const result = await apiCall("POST", endpoint, body);
  return { id: String(result?.id ?? Date.now()) };
};

export const updateDoc = async (ref: DocRef, data: any): Promise<void> => {
  const endpoint = COLLECTION_ENDPOINTS[ref._col];
  if (!endpoint) { console.warn("[compat] updateDoc ignorado para colección legacy:", ref._col); return; }
  const body = toServerFields(ref._col, data);
  await apiCall("PATCH", `${endpoint}/${ref._id}`, body);
};

export const deleteDoc = async (ref: DocRef): Promise<void> => {
  const endpoint = COLLECTION_ENDPOINTS[ref._col];
  if (!endpoint) { console.warn("[compat] deleteDoc ignorado para colección legacy:", ref._col); return; }
  await apiCall("DELETE", `${endpoint}/${ref._id}`);
};

export const getDocs = async (ref: CollectionRef | QueryRef): Promise<{ docs: { id: string; data: () => any; ref: DocRef }[]; empty: boolean }> => {
  const col = (ref as any)._col;
  const endpoint = COLLECTION_ENDPOINTS[col];
  if (!endpoint) return { docs: [], empty: true };
  const data = await apiCall("GET", endpoint);
  const list: any[] = Array.isArray(data) ? data : [];
  return {
    empty: list.length === 0,
    docs: list.map(item => ({
      id: String(item.id),
      data: () => item,
      ref: doc(db, col, String(item.id)),
    })),
  };
};

export const getDocFromServer = async (_ref: DocRef) => ({ data: () => null });

// ─── Batch ───────────────────────────────────────────────────────────────────
export const writeBatch = (_db: any) => {
  const ops: Array<() => Promise<any>> = [];
  return {
    set: (ref: DocRef, data: any) => {
      ops.push(() => addDoc({ _col: ref._col }, data));
    },
    update: (ref: DocRef, data: any) => {
      ops.push(() => updateDoc(ref, data));
    },
    delete: (ref: DocRef) => {
      ops.push(() => deleteDoc(ref));
    },
    commit: async () => {
      for (const op of ops) { try { await op(); } catch (e) { console.error("[compat] batch op failed:", e); } }
    },
  };
};
