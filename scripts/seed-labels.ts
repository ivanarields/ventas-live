import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// ============================================================================
// Seed de prueba para el sistema de etiquetas en Supabase.
// Uso: npx tsx scripts/seed-labels.ts
// Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env
// ============================================================================

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SEED_PREFIX = "seed-";

type Scenario = {
  firebaseCustomerId: string;
  name: string;
  whatsapp?: string;
  firebasePedidoId: string;
  totalBags: number;
  totalItems: number;
};

const scenarios: Scenario[] = [
  { firebaseCustomerId: `${SEED_PREFIX}c1`, name: "ANA PEREZ",    whatsapp: "5491100000001", firebasePedidoId: `${SEED_PREFIX}p1`, totalBags: 1, totalItems: 12 },
  { firebaseCustomerId: `${SEED_PREFIX}c2`, name: "LUIS GOMEZ",   whatsapp: "5491100000002", firebasePedidoId: `${SEED_PREFIX}p2`, totalBags: 1, totalItems: 8  },
  { firebaseCustomerId: `${SEED_PREFIX}c3`, name: "MARIA LOPEZ",  whatsapp: "5491100000003", firebasePedidoId: `${SEED_PREFIX}p3`, totalBags: 3, totalItems: 25 },
  { firebaseCustomerId: `${SEED_PREFIX}c4`, name: "JORGE FERNANDEZ",                          firebasePedidoId: `${SEED_PREFIX}p4`, totalBags: 2, totalItems: 14 },
  { firebaseCustomerId: `${SEED_PREFIX}c5`, name: "SOFIA RAMIREZ", whatsapp: "5491100000005",firebasePedidoId: `${SEED_PREFIX}p5`, totalBags: 1, totalItems: 5  },
];

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

async function cleanPreviousSeed() {
  console.log("\n[1/5] Limpiando seeds previos...");

  const { data: orders } = await sb
    .from("orders")
    .select("id, firebase_id")
    .like("firebase_id", `${SEED_PREFIX}%`);

  const orderIds = (orders ?? []).map(o => o.id);
  if (orderIds.length > 0) {
    await sb.from("container_allocations").delete().in("order_id", orderIds);
    await sb.from("order_bags").delete().in("order_id", orderIds);
    await sb.from("orders").delete().in("id", orderIds);
  }

  await sb.from("customers").delete().like("firebase_id", `${SEED_PREFIX}%`);

  await sb.from("storage_containers").update({
    current_simple_orders: 0,
    current_bags_used: 0,
    state: "AVAILABLE",
  }).neq("id", 0);

  console.log(`   ✓ Eliminados ${orderIds.length} pedidos de seed y sus allocations.`);
}

async function runScenario(s: Scenario) {
  const { data: customerId, error: cErr } = await sb.rpc("fn_upsert_customer", {
    p_firebase_id: s.firebaseCustomerId,
    p_full_name: s.name,
    p_normalized_name: normalize(s.name),
    p_whatsapp_number: s.whatsapp ?? null,
  });
  if (cErr) throw new Error(`upsert customer ${s.name}: ${cErr.message}`);

  const { data: orderData, error: oErr } = await sb.rpc("fn_upsert_order_and_assign", {
    p_firebase_id: s.firebasePedidoId,
    p_customer_id: customerId as unknown as number,
    p_total_bags: s.totalBags,
    p_total_items: s.totalItems,
    p_total_amount: 0,
    p_assigned_by: "seed-script",
  });
  if (oErr) throw new Error(`upsert order ${s.firebasePedidoId}: ${oErr.message}`);

  const row = Array.isArray(orderData) ? orderData[0] : orderData;
  return {
    scenario: s,
    orderId: row.out_order_id as number,
    container: row.out_container_code as string,
    migrated: row.out_was_migrated as boolean,
  };
}

async function showPanel(label: string) {
  const { data, error } = await sb
    .from("storage_containers")
    .select("container_code, container_type, current_simple_orders, current_bags_used, max_bags_capacity, state")
    .order("priority_order", { ascending: true });
  if (error) throw error;
  console.log(`\n--- Panel (${label}) ---`);
  console.table(data);
}

async function showAllocations() {
  const { data, error } = await sb
    .from("container_allocations")
    .select("order_id, allocation_type, bags_reserved, status, storage_containers!container_allocations_container_id_fkey(container_code)")
    .order("id", { ascending: true });
  if (error) throw error;
  const flat = (data ?? []).map((a: any) => ({
    order_id: a.order_id,
    container: a.storage_containers?.container_code,
    type: a.allocation_type,
    bags: a.bags_reserved,
    status: a.status,
  }));
  console.log("\n--- Allocations ---");
  console.table(flat);
}

async function main() {
  console.log("=== SEED del sistema de etiquetas ===");
  await cleanPreviousSeed();
  await showPanel("antes del seed");

  console.log("\n[2/5] Creando pedidos y asignando casilleros...");
  const results: Awaited<ReturnType<typeof runScenario>>[] = [];
  for (const s of scenarios) {
    const r = await runScenario(s);
    results.push(r);
    console.log(`   ✓ ${s.name.padEnd(18)} (${s.totalBags}b) → casillero ${r.container}${r.migrated ? " [migrado]" : ""}`);
  }

  await showPanel("después de asignar");

  console.log("\n[3/5] Migración SIMPLE→COMPLEX: ANA pasa de 1 a 2 bolsas");
  const migResult = await runScenario({
    ...scenarios[0],
    totalBags: 2,
    totalItems: 20,
  });
  console.log(`   Resultado: casillero ${migResult.container} | migrado=${migResult.migrated}`);

  await showPanel("después de migración");

  console.log("\n[4/5] Entregando el pedido de LUIS (libera casillero numérico)");
  const { error: relErr } = await sb.rpc("fn_release_order_by_firebase_id", {
    p_firebase_id: `${SEED_PREFIX}p2`,
    p_released_by: "seed-script",
    p_reason: "DELIVERED",
  });
  if (relErr) throw relErr;
  console.log("   ✓ LUIS entregado.");

  await showPanel("después de entrega");
  await showAllocations();

  console.log("\n[5/5] Resumen final:");
  console.table(results.map(r => ({
    cliente: r.scenario.name,
    bolsas: r.scenario.totalBags,
    casillero: r.container,
  })));

  console.log("\n✓ Seed completo. Verifica el panel en Supabase.");
}

main().catch(err => {
  console.error("\n✗ Error:", err);
  process.exit(1);
});
