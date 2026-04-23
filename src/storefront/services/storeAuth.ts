/**
 * storeAuth — Servicio de autenticación para la Tienda Online
 * 
 * Los clientes se identifican con: Número de WhatsApp + PIN de 4 dígitos.
 * En segundo plano usamos: phone@tiendaleydi.com como email y pin-XXXX como contraseña.
 * La sesión se guarda en localStorage bajo 'store_session'.
 * 
 * ⚠️ Este servicio NO usa el cliente supabase de la app principal (ChehiAppAbril).
 *    Toda la autenticación va vía el backend (/api/store-auth/*) que usa supabaseStore.
 */

const SESSION_KEY = 'store_session';

export interface StoreUser {
  id: string;
  phone: string;
  name: string;
}

interface StoredSession {
  token: string;
  user: StoreUser;
  expiresAt: number; // timestamp
}

export const storeAuth = {

  /** Guardar sesión después de login/registro exitoso */
  saveSession: (token: string, user: StoreUser): void => {
    const session: StoredSession = {
      token,
      user,
      expiresAt: Date.now() + 15 * 24 * 60 * 60 * 1000 // 15 días
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  },

  /** Obtener usuario actual de forma síncrona (desde localStorage) */
  getCurrentUserSync: (): StoreUser | null => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session: StoredSession = JSON.parse(raw);
      if (Date.now() > session.expiresAt) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session.user;
    } catch {
      return null;
    }
  },

  /** Obtener usuario actual de forma asíncrona (verifica con el servidor) */
  getCurrentUser: async (): Promise<StoreUser | null> => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session: StoredSession = JSON.parse(raw);
      if (Date.now() > session.expiresAt) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }

      // Validar el token con el servidor
      const res = await fetch('/api/store-auth/me', {
        headers: { 'Authorization': `Bearer ${session.token}` }
      });
      if (!res.ok) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }

      return session.user;
    } catch {
      return null;
    }
  },

  /** Obtener el token de acceso para peticiones autenticadas */
  getToken: async (): Promise<string | null> => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session: StoredSession = JSON.parse(raw);
      if (Date.now() > session.expiresAt) return null;
      return session.token;
    } catch {
      return null;
    }
  },

  /** Cerrar sesión */
  logout: (): void => {
    localStorage.removeItem(SESSION_KEY);
  },
};
