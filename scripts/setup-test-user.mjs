// Crea un usuario de prueba en Supabase Auth para aislar los tests de IA.
// Todo lo que corra bajo este user_id NO toca tus datos reales.
//
// USO:
//   node scripts/setup-test-user.mjs
//
// El script es IDEMPOTENTE: si el usuario ya existe, no lo recrea, solo muestra
// los datos existentes.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const clean = (v) => v?.replace(/^"/, '').replace(/"$/, '').trim();
const SUPABASE_URL = clean(env.match(/^SUPABASE_URL=(.+)/m)?.[1]);
const SERVICE_KEY = clean(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)/m)?.[1]);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_EMAIL = 'test-ai-fixtures@ventaslive.test';
const TEST_PASSWORD = 'TestFixtures2026!';
const REAL_USER_ID = '13dcb065-6099-4776-982c-18e98ff2b27a'; // NO TOCAR

console.log('════════════════════════════════════════════════════');
console.log('  SETUP USER DE PRUEBA (aislado de datos reales)');
console.log('════════════════════════════════════════════════════\n');

// Buscar si ya existe
console.log(`Buscando usuario ${TEST_EMAIL}...`);
const { data: { users }, error: listError } = await sb.auth.admin.listUsers();
if (listError) {
  console.error('❌ No se pudo listar usuarios:', listError.message);
  process.exit(1);
}

let testUser = users.find(u => u.email === TEST_EMAIL);

if (testUser) {
  console.log(`✅ Usuario de prueba YA EXISTE`);
  console.log(`   id: ${testUser.id}`);
  console.log(`   email: ${testUser.email}`);
} else {
  console.log(`⚙️  Creando usuario nuevo...`);
  const { data, error } = await sb.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { role: 'test-ai-fixtures', purpose: 'IA test isolation' },
  });
  if (error) {
    console.error('❌ No se pudo crear:', error.message);
    process.exit(1);
  }
  testUser = data.user;
  console.log(`✅ Usuario creado`);
  console.log(`   id: ${testUser.id}`);
  console.log(`   email: ${testUser.email}`);
}

// SAFETY CHECK fundamental
if (testUser.id === REAL_USER_ID) {
  console.error('\n🚨🚨🚨 ERROR DE SEGURIDAD: el user_id de prueba coincide con el real.');
  console.error('   Abortando para proteger tus datos.');
  process.exit(1);
}

// Guardar el ID en un archivo para que otros scripts lo lean
const configFile = 'tests/test-user.json';
writeFileSync(configFile, JSON.stringify({
  test_user_id: testUser.id,
  test_email: TEST_EMAIL,
  real_user_id: REAL_USER_ID,
  created_at: new Date().toISOString(),
  warning: 'Este archivo define el aislamiento. NUNCA poner el real_user_id como test_user_id.',
}, null, 2));

console.log(`\n📁 Configuración guardada en ${configFile}`);
console.log('\n✅ LISTO. Los scripts de test usarán este user_id automáticamente.');
console.log(`   Test user:  ${testUser.id}`);
console.log(`   Real user:  ${REAL_USER_ID}  ← INTOCABLE`);
console.log('════════════════════════════════════════════════════');
