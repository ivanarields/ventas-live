import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const url = process.env.VITE_STORE_SUPABASE_URL;
const key = process.env.STORE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("❌ Faltan variables VITE_STORE_SUPABASE_URL o STORE_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sqlPath = process.argv[2] || path.join(process.cwd(), "docs/nuevo sistema de tienda", "migracion-tienda-mayo.sql");

if (!fs.existsSync(sqlPath)) {
  console.error("❌ No existe el archivo SQL:", sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");
const sb = createClient(url, key, { auth: { persistSession: false } });

async function runViaPgQuery(fullSql) {
  const res = await fetch(`${url.replace(/\/$/, '')}/pg/query`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'text/plain',
    },
    body: fullSql,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`pg/query HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text;
}

async function run() {
  console.log("🔧 Ejecutando migracion de tienda...");
  console.log("📄 Archivo:", sqlPath);

  try {
    const result = await runViaPgQuery(sql);
    console.log("✅ Migracion ejecutada via pg/query");
    if (result) console.log(result.slice(0, 1000));
    return;
  } catch (err) {
    console.warn("⚠️ No se pudo ejecutar via pg/query:", err.message);
    console.warn("Intentando via RPC exec_sql...");
  }

  // Primero crear exec_sql si no existe
  const createExecSql = `
    CREATE OR REPLACE FUNCTION exec_sql(query text)
    RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      EXECUTE query;
    END;
    $$;
  `;
  
  try {
    await sb.rpc('exec_sql', { sql: createExecSql });
    console.log("✅ Funcion exec_sql creada/verificada");
  } catch (e) {
    console.log("⚠️ exec_sql puede que ya exista o no se pudo crear:", e.message);
  }

  const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
  let ok = 0;
  let fail = 0;

  for (const stmt of stmts) {
    try {
      const { error } = await sb.rpc('exec_sql', { sql: stmt + ';' });
      if (error) {
        console.warn("⚠️ SQL error:", error.message);
        fail++;
      } else {
        ok++;
      }
    } catch (err) {
      console.warn("⚠️ Error:", err.message);
      fail++;
    }
  }

  console.log(`\n✅ ${ok} sentencias OK`);
  if (fail > 0) console.log(`⚠️ ${fail} sentencias con problemas (normal si tablas/columnas ya existen)`);
  console.log("\n💡 Si hay problemas, ejecuta el SQL manualmente en Supabase Dashboard > SQL Editor");
}

run();
