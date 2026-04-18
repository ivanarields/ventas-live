import express from "express";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const cleanName = (name) => {
  if (!name) return "";
  let cleaned = name.trim();
  [/^QR de\s+/i, /^Pago de\s+/i, /^Transferencia de\s+/i, /^Transf\.\s+/i, /^Sr\.\s+/i, /^Sra\.\s+/i, /^Lic\.\s+/i]
    .forEach(r => { cleaned = cleaned.replace(r, ""); });
  return cleaned.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase().trim();
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
    const { data: order, error: orderErr } = await supabase.from("orders").insert({ customer_id: customerId, order_code, logistics_type, total_bags: totalBags, total_items: totalItems ?? 0, total_amount: totalAmount, notes, order_status: "IN_PROCESS" }).select().single();
    if (orderErr || !order) throw orderErr ?? new Error("No se creó el pedido");
    await supabase.from("order_bags").insert(Array.from({ length: totalBags }, (_, i) => ({ order_id: order.id, bag_number: i + 1 })));
    const { data: assignData, error: assignErr } = await supabase.rpc("fn_assign_container", { p_order_id: order.id, p_assigned_by: assignedBy });
    if (assignErr) throw assignErr;
    const raw = Array.isArray(assignData) ? assignData[0] : assignData;
    res.status(201).json({ order, label: { container_id: raw.out_container_id, container_code: raw.out_container_code, allocation_id: raw.out_allocation_id } });
  } catch (err) { res.status(500).json({ error: err?.message ?? "Error interno" }); }
});

app.post("/api/orders/:id/update-bags", async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { newTotalBags, migratedBy = "operator" } = req.body;
    if (!newTotalBags || newTotalBags < 1) return res.status(400).json({ error: "newTotalBags inválido" });
    const { data: current, error: readErr } = await supabase.from("orders").select("logistics_type, total_bags").eq("id", orderId).single();
    if (readErr || !current) return res.status(404).json({ error: "Pedido no encontrado" });
    if (current.logistics_type === "SIMPLE" && newTotalBags >= 2) {
      const { data, error } = await supabase.rpc("fn_migrate_to_complex", { p_order_id: orderId, p_new_total_bags: newTotalBags, p_migrated_by: migratedBy });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return res.json({ migrated: true, label: { container_id: row.out_new_container_id, container_code: row.out_new_container_code, allocation_id: row.out_new_allocation_id, old_container_code: row.out_old_container_code } });
    }
    await supabase.from("orders").update({ total_bags: newTotalBags }).eq("id", orderId);
    res.json({ migrated: false });
  } catch (err) { res.status(500).json({ error: err?.message ?? "Error interno" }); }
});

app.post("/api/orders/:id/deliver", async (req, res) => {
  try {
    const { error } = await supabase.rpc("fn_release_container", { p_order_id: Number(req.params.id), p_released_by: req.body?.releasedBy ?? "operator", p_reason: "DELIVERED" });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err?.message ?? "Error interno" }); }
});

app.get("/api/storage/containers", async (_req, res) => {
  try {
    const { data, error } = await supabase.from("storage_containers").select("*").order("priority_order", { ascending: true });
    if (error) throw error;
    res.json({ containers: data ?? [] });
  } catch (err) { res.status(500).json({ error: err?.message ?? "Error interno" }); }
});

app.get("/api/orders/:id/allocation-history", async (req, res) => {
  try {
    const { data, error } = await supabase.from("container_allocations").select("*, storage_containers(container_code)").eq("order_id", Number(req.params.id)).order("assigned_at", { ascending: false });
    if (error) throw error;
    res.json({ history: data ?? [] });
  } catch (err) { res.status(500).json({ error: err?.message ?? "Error interno" }); }
});

// ── CLIENTES ──────────────────────────────────────────────────────────────────

app.get("/api/clientes", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("customers").select("*").eq("user_id", userId).eq("is_active", true).order("full_name", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/clientes", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { name, canonicalName, phone } = req.body;
  const { data, error } = await supabase.from("customers").insert({ full_name: name, normalized_name: canonicalName ?? cleanName(name), canonical_name: canonicalName ?? cleanName(name), phone: phone ?? "", active_label: "", active_label_type: "", user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch("/api/clientes/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("customers").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/clientes/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabase.from("customers").update({ is_active: false }).eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── PAGOS ─────────────────────────────────────────────────────────────────────

app.get("/api/pagos-lista", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("pagos").select("*").eq("user_id", userId).order("date", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/pagos", async (req, res) => {
  try {
    const { nombre, pago, method, status, fecha, customerId } = req.body;
    const userId = req.headers["x-user-id"] ?? "mobile";
    if (!nombre || !pago) return res.status(400).json({ error: "Nombre y pago son requeridos" });
    const { data, error } = await supabase.from("pagos").insert({ nombre: cleanName(nombre), pago: Number(pago), method: method ?? "HTTP Request", status: status ?? "pending", date: fecha ? new Date(fecha) : new Date(), customer_id: customerId ?? null, user_id: userId }).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, id: data.id, data });
  } catch (err) { res.status(500).json({ error: "Error interno del servidor" }); }
});

app.patch("/api/pagos/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("pagos").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/pagos/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabase.from("pagos").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── PEDIDOS ───────────────────────────────────────────────────────────────────

app.get("/api/pedidos", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("pedidos").select("*").eq("user_id", userId).order("date", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/pedidos", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { customerId, customerName, itemCount, bagCount, label, labelType, status, totalAmount } = req.body;
  const { data, error } = await supabase.from("pedidos").insert({ customer_id: customerId ?? null, customer_name: customerName, item_count: itemCount ?? 0, bag_count: bagCount ?? 1, label: label ?? "", label_type: labelType ?? "", status: status ?? "procesar", total_amount: totalAmount ?? 0, user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch("/api/pedidos/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });

  const { data, error } = await supabase.from("pedidos")
    .update({ ...req.body, updated_at: new Date() })
    .eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Si el pedido pasa a "listo" O si ya está en "listo" y cambia bag_count → reasignar etiqueta
  const effectiveStatus = data.status ?? req.body.status ?? "";
  const shouldAssignLabel = data.customer_id &&
    (req.body.status === "listo" || (effectiveStatus === "listo" && req.body.bag_count !== undefined));
  if (shouldAssignLabel) {
    try {
      const { data: customer } = await supabase.from("customers")
        .select("full_name, normalized_name, phone").eq("id", data.customer_id).single();

      // Upsert cliente en sistema de etiquetas
      const { data: custId } = await supabase.rpc("fn_upsert_customer", {
        p_firebase_id: String(data.customer_id),
        p_full_name: customer?.full_name ?? data.customer_name ?? "",
        p_normalized_name: customer?.normalized_name ?? cleanName(data.customer_name ?? ""),
        p_whatsapp_number: customer?.phone ?? null,
      });

      // Upsert pedido y asignar casillero
      const { data: labelData } = await supabase.rpc("fn_upsert_order_and_assign", {
        p_firebase_id: String(data.id),
        p_customer_id: custId,
        p_total_bags: data.bag_count ?? 1,
        p_total_items: data.item_count ?? 0,
        p_total_amount: data.total_amount ?? 0,
        p_assigned_by: "app",
      });

      const row = Array.isArray(labelData) ? labelData[0] : labelData;
      if (row?.out_container_code) {
        const labelType = /^\d+$/.test(row.out_container_code) ? "number" : "letter";
        // Guardar etiqueta en pedido
        await supabase.from("pedidos").update({ label: row.out_container_code, label_type: labelType })
          .eq("id", data.id);
        // Guardar etiqueta en cliente
        await supabase.from("customers").update({
          active_label: row.out_container_code,
          active_label_type: labelType,
          label_updated_at: new Date(),
        }).eq("id", data.customer_id);

        data.label = row.out_container_code;
        data.label_type = labelType;
      }
    } catch (labelErr) {
      console.error("[etiqueta] error asignando etiqueta:", labelErr);
    }
  }

  // Si el pedido pasa a "entregado", liberar etiqueta
  if (req.body.status === "entregado" && data.customer_id) {
    try {
      await supabase.rpc("fn_release_order_by_firebase_id", {
        p_firebase_id: String(data.id),
        p_released_by: "app",
        p_reason: "DELIVERED",
      });
      await supabase.from("customers").update({ active_label: "", active_label_type: "", label_updated_at: new Date() })
        .eq("id", data.customer_id);
    } catch (releaseErr) {
      console.error("[etiqueta] error liberando etiqueta:", releaseErr);
    }
  }

  res.json(data);
});

app.delete("/api/pedidos/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabase.from("pedidos").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── TRANSACCIONES ─────────────────────────────────────────────────────────────

app.get("/api/transacciones", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("transactions").select("*").eq("user_id", userId).order("fecha", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/transacciones", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("transactions").insert({ ...req.body, user_id: userId, fecha: req.body.fecha ?? new Date() }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch("/api/transacciones/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("transactions").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/transacciones/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabase.from("transactions").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── CATEGORÍAS ────────────────────────────────────────────────────────────────

app.get("/api/categorias", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("categories").select("*").eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/categorias", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("categories").insert({ ...req.body, user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch("/api/categorias/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("categories").update({ ...req.body, updated_at: new Date() }).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/categorias/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabase.from("categories").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── LIVES ─────────────────────────────────────────────────────────────────────

app.get("/api/lives", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("live_sessions").select("*").eq("user_id", userId).order("scheduled_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/lives", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("live_sessions").insert({ ...req.body, user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch("/api/lives/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("live_sessions").update(req.body).eq("id", req.params.id).eq("user_id", userId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete("/api/lives/:id", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { error } = await supabase.from("live_sessions").delete().eq("id", req.params.id).eq("user_id", userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── IDEAS ─────────────────────────────────────────────────────────────────────

app.get("/api/ideas", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("ideas").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post("/api/ideas", async (req, res) => {
  const userId = req.headers["x-user-id"];
  if (!userId) return res.status(401).json({ error: "x-user-id requerido" });
  const { data, error } = await supabase.from("ideas").insert({ ...req.body, user_id: userId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ── AUTH ──────────────────────────────────────────────────────────────────────

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email y contraseña requeridos" });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email y contraseña requeridos" });
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ user: data.user });
});

app.post("/api/auth/logout", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) await supabase.auth.admin.signOut(token);
  res.json({ success: true });
});

app.get("/api/auth/me", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Token requerido" });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Token inválido" });
  res.json({ user: data.user });
});

export default app;
