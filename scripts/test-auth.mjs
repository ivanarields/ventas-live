import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sb = createClient(url, key);

async function testAuth() {
  console.log("Intentando crear usuario...");
  const fakeEmail = "77712345@tiendaleydi.com";
  const password = "pin-1234"; // Mínimo 6 caracteres

  const { data, error } = await sb.auth.admin.createUser({
    email: fakeEmail,
    password: password,
    email_confirm: true // Auto confirm
  });

  if (error) {
    console.error("Error al crear usuario:", error);
  } else {
    console.log("Usuario creado exitosamente:", data.user.id);
    
    console.log("Intentando login...");
    const authClient = createClient(url, process.env.VITE_SUPABASE_ANON_KEY);
    const { data: loginData, error: loginErr } = await authClient.auth.signInWithPassword({
      email: fakeEmail,
      password: password
    });
    
    if (loginErr) {
      console.error("Error login:", loginErr);
    } else {
      console.log("Login exitoso! Token:", loginData.session.access_token.substring(0, 20) + "...");
    }

    // Limpiar prueba
    await sb.auth.admin.deleteUser(data.user.id);
    console.log("Usuario de prueba eliminado.");
  }
}

testAuth();
