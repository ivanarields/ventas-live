import "dotenv/config";
import fs from "fs";
import path from "path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = "thgbfurscfjcmgokyyif";
const sqlPath = process.argv[2] || path.join(process.cwd(), "docs/nuevo sistema de tienda", "migracion-tienda-mayo.sql");

if (!token) {
  console.error("Falta SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}
if (!fs.existsSync(sqlPath)) {
  console.error("No existe SQL:", sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text.slice(0, 2000));
if (!res.ok) process.exit(1);
