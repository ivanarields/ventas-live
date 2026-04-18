// Cliente HTTP hacia el Express server. Reemplaza todas las llamadas Firebase.

const BASE = "";

let _userId: string | null = null;
let _token: string | null = null;

export function setAuthContext(userId: string, token: string) {
  _userId = userId;
  _token = token;
}

export function clearAuthContext() {
  _userId = null;
  _token = null;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (_userId) headers["x-user-id"] = _userId;
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

// ─── AUTH ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () =>
    apiFetch("/api/auth/logout", { method: "POST" }),
  me: () =>
    apiFetch("/api/auth/me"),
};

// ─── CLIENTES ─────────────────────────────────────────────────────────────────
export const clientesApi = {
  list: () => apiFetch("/api/clientes"),
  create: (body: Record<string, any>) =>
    apiFetch("/api/clientes", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string | number, body: Record<string, any>) =>
    apiFetch(`/api/clientes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string | number) =>
    apiFetch(`/api/clientes/${id}`, { method: "DELETE" }),
};

// ─── PAGOS ────────────────────────────────────────────────────────────────────
export const pagosApi = {
  list: () => apiFetch("/api/pagos-lista"),
  create: (body: Record<string, any>) =>
    apiFetch("/api/pagos", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string | number, body: Record<string, any>) =>
    apiFetch(`/api/pagos/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string | number) =>
    apiFetch(`/api/pagos/${id}`, { method: "DELETE" }),
};

// ─── PEDIDOS ──────────────────────────────────────────────────────────────────
export const pedidosApi = {
  list: () => apiFetch("/api/pedidos"),
  create: (body: Record<string, any>) =>
    apiFetch("/api/pedidos", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string | number, body: Record<string, any>) =>
    apiFetch(`/api/pedidos/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string | number) =>
    apiFetch(`/api/pedidos/${id}`, { method: "DELETE" }),
};

// ─── TRANSACCIONES ────────────────────────────────────────────────────────────
export const transaccionesApi = {
  list: () => apiFetch("/api/transacciones"),
  create: (body: Record<string, any>) =>
    apiFetch("/api/transacciones", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string | number, body: Record<string, any>) =>
    apiFetch(`/api/transacciones/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string | number) =>
    apiFetch(`/api/transacciones/${id}`, { method: "DELETE" }),
};

// ─── CATEGORÍAS ───────────────────────────────────────────────────────────────
export const categoriasApi = {
  list: () => apiFetch("/api/categorias"),
  create: (body: Record<string, any>) =>
    apiFetch("/api/categorias", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string | number, body: Record<string, any>) =>
    apiFetch(`/api/categorias/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string | number) =>
    apiFetch(`/api/categorias/${id}`, { method: "DELETE" }),
};

// ─── LIVES ────────────────────────────────────────────────────────────────────
export const livesApi = {
  list: () => apiFetch("/api/lives"),
  create: (body: Record<string, any>) =>
    apiFetch("/api/lives", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string | number, body: Record<string, any>) =>
    apiFetch(`/api/lives/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string | number) =>
    apiFetch(`/api/lives/${id}`, { method: "DELETE" }),
};

// ─── IDEAS ────────────────────────────────────────────────────────────────────
export const ideasApi = {
  list: () => apiFetch("/api/ideas"),
  create: (body: Record<string, any>) =>
    apiFetch("/api/ideas", { method: "POST", body: JSON.stringify(body) }),
};

// ─── ETIQUETAS (Supabase directamente vía server) ─────────────────────────────
export const etiquetasApi = {
  containers: () => apiFetch("/api/storage/containers"),
};
