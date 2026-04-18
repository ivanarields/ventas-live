import express from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseServer = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const cleanName = (name: string) => {
  if (!name) return "";
  let cleaned = name.trim();
  const prefixes = [
    /^QR de\s+/i, /^Pago de\s+/i, /^Transferencia de\s+/i,
    /^Transf\.\s+/i, /^Sr\.\s+/i, /^Sra\.\s+/i, /^Lic\.\s+/i,
  ];
  prefixes.forEach(reg => { cleaned = cleaned.replace(reg, ""); });
  cleaned = cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return cleaned.replace(/\s+/g, " ").toUpperCase().trim();
};

const app = express();
app.use(express.json());

// ── SISTEMA DE ETIQUETAS ──────────────────────────────────────────────────────

app.post("/api/orders", async (req, res) => {
  try {
    const { customerId, totalItems, totalBags, totalAmount = 0, notes, assignedBy = "operator" } = req.body;
    if (!customerId || !totalBags) return res.status(400).json({ error: "customerId y totalBags son requeridos" });
    const logistics_type = totalBags >= 2 ? "COMPLEX" : "SIMPLE";
    const order_code = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const { data: order, error: orderErr } = await supabaseServer
      .from("orders").insert({ customer_id: customerId, order_code, logistics_type, total_bags: totalBags, total_items: totalItems ?? 0, total_amount: totalAmount, notes, order_status: "IN_PROCESS" }).select().single();
    if (orderErr || !order) throw orderErr ?? new Error("No se creó el pedido");
    await supabaseServer.from("order_bags").insert(Array.from({ length: totalBags }, (_, i) => ({ order_id: order.id, bag_number: i + 1 })));
    const { data: assignData, error: assignErr } = await supabaseServer.rpc("fn_assign_container", { p_order_id: order.id, p_assigned_by: assignedBy });
    if (assignErr) throw assignErr;
    const raw = Array.isArray(assignData) ? assignData[0] : assignData;
    res.status(201).json({ order, label: { container_id: raw.out_container_id, container_code: raw.out_container_code, allocation_id: raw.out_allocation_id } });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Error interno" }); }
});

app.post("/api/orders/:id/update-bags", async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { newTotalBags, migratedBy = "operator" } = req.body;
    if (!newTotalBags || newTotalBags < 1) return res.status(400).json({ error: "newTotalBags inválido" });
    const { data: current, error: readErr } = await supabaseServer.from("orders").select("logistics_type, total_bags").eq("id", orderId).single();
    if (readErr || !current) return res.status(404).json({ error: "Pedido no encontrado" });
    if (current.logistics_type === "SIMPLE" && newTotalBags >= 2) {
      const { data, error } = await supabaseServer.rpc("fn_migrate_to_complex", { p_order_id: orderId, p_new_total_bags: newTotalBags, p_migrated_by: migratedBy });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return res.json({ migrated: true, label: { container_id: row.out_new_container_id, container_code: row.out_new_container_code, allocation_id: row.out_new_allocation_id, old_container_code: row.out_old_container_code } });
    }
    await supabaseServer.from("orders").update({ total_bags: newTotalBags }).eq("id", orderId);
    res.json({ migrated: false });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Error interno" }); }
});

app.post("/api/orders/:id/deliver", async (req, res) => {
  try {
    const { error } = await supabaseServer.rpc("fn_release_container", { p_order_id: Number(req.params.id), p_released_by: req.body?.releasedBy ?? "operator", p_reason: "DELIVERED" });
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Error interno" }); }
});

app.get("/api/storage/containers", async (_req, res) => {
  try {
    const { data, error } = await supabaseServer.from("storage_containers").select("*").order("priority_order", { ascending: true });
    if (error) throw error;
    res.json({ containers: data ?? [] });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Error interno" }); }
});

app.get("/api/orders/:id/allocation-history", async (req, res) => {
  try {
    const { data, error } = await supabaseServer.from("container_allocations").select("*, storage_containers(container_code)").eq("order_id", Number(req.params.id)).order("assigned_at", { ascending: false });
    if (error) throw error;
    res.json({ history: data ?? [] });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Error interno" }); }
});

// ── CLIENTES ─────────────────────────────────────────────────────────────────

app.get("/api/clientes", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("customers").select("*").eq("user_id", userId).eq("is_active", true).order("full_name", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/clientes", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { name, canonicalName, phone } = req.body;
  const { data, error } = await supabaseServer.from("customers").insert({ full_name: name, normalized_name: canonicalName ?? cleanName(name), canonical_name: canonicalName ?? cleanName(name), phone: phone ?? "", active_label: "", active_label_type: "", user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch("/api/clientes/:id", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("customers").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/clientes/:id", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabaseServer.from("customers").update({ is_active: false }).eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── PAGOS ─────────────────────────────────────────────────────────────────────

app.get("/api/pagos-lista", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("pagos").select("*").eq("user_id", userId).order("date", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/pagos", async (req, res) => {
  try {
    const { nombre, pago, method, status, fecha, customerId } = req.body;
    const userId = (req.headers["x-user-id"] as string) ?? "mobile";
    if (!nombre || !pago) return res.status(400).json({ error: "Nombre y pago son requeridos" });
    const { data, error } = await supabaseServer.from("pagos").insert({ nombre: cleanName(nombre), pago: Number(pago), method: method ?? "HTTP Request", status: status ?? "pending", date: fecha ? new Date(fecha) : new Date(), customer_id: customerId ?? null, user_id: userId }).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, id: data.id, data });
  } catch (error: any) { res.status(500).json({ error: "Error interno del servidor" }); }
});

app.patch("/api/pagos/:id", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("pagos").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/pagos/:id", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabaseServer.from("pagos").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── PEDIDOS ───────────────────────────────────────────────────────────────────

app.get("/api/pedidos", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("pedidos").select("*").eq("user_id", userId).order("date", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/pedidos", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { customerId, customerName, itemCount, bagCount, label, labelType, status, totalAmount } = req.body;
  const { data, error } = await supabaseServer.from("pedidos").insert({ customer_id: customerId ?? null, customer_name: customerName, item_count: itemCount ?? 0, bag_count: bagCount ?? 1, label: label ?? "", label_type: labelType ?? "", status: status ?? "procesar", total_amount: totalAmount ?? 0, user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch("/api/pedidos/:id", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("pedidos").update({ ...req.body, updated_at: new Date() }).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/pedidos/:id", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabaseServer.from("pedidos").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── TRANSACCIONES ─────────────────────────────────────────────────────────────

app.get("/api/transacciones", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("transactions").select("*").eq("user_id", userId).order("fecha", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/transacciones", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("transactions").insert({ ...req.body, user_id: userId, fecha: req.body.fecha ?? new Date() }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch("/api/transacciones/:id", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("transactions").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/transacciones/:id", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabaseServer.from("transactions").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── CATEGORÍAS ────────────────────────────────────────────────────────────────

app.get("/api/categorias", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("categories").select("*").eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/categorias", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("categories").insert({ ...req.body, user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch("/api/categorias/:id", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("categories").update({ ...req.body, updated_at: new Date() }).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/categorias/:id", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabaseServer.from("categories").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── LIVES ─────────────────────────────────────────────────────────────────────

app.get("/api/lives", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("live_sessions").select("*").eq("user_id", userId).order("scheduled_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/lives", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("live_sessions").insert({ ...req.body, user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch("/api/lives/:id", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("live_sessions").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/lives/:id", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabaseServer.from("live_sessions").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── IDEAS ─────────────────────────────────────────────────────────────────────

app.get("/api/ideas", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("ideas").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/ideas", async (req, res) => {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabaseServer.from("ideas").insert({ ...req.body, user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ── AUTH ──────────────────────────────────────────────────────────────────────

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email y contraseña requeridos" });
  const { data, error } = await supabaseServer.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email y contraseña requeridos" });
  const { data, error } = await supabaseServer.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ user: data.user });
});

app.post("/api/auth/logout", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) await supabaseServer.auth.admin.signOut(token);
  res.json({ success: true });
});

app.get("/api/auth/me", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Token requerido" });
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Token inválido" });
  res.json({ user: data.user });
});

export default app;
