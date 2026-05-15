export interface StoreSettings {
  store_name?: string;
  store_phone?: string;
  official_wa_number?: string;
  next_live_date?: string;
  next_live_time?: string;
  delivery_note?: string;
  address?: string;
  store_chips?: string;
  payment_qr_url?: string;
}

let settingsCache: StoreSettings | null = null;
let settingsRequest: Promise<StoreSettings | null> | null = null;

export async function getStoreSettings(): Promise<StoreSettings | null> {
  if (settingsCache) return settingsCache;
  if (!settingsRequest) {
    settingsRequest = fetch('/api/store/settings')
      .then(r => r.ok ? r.json() : null)
      .then(settings => {
        settingsCache = settings;
        return settings;
      })
      .catch(() => null)
      .finally(() => {
        settingsRequest = null;
      });
  }
  return settingsRequest;
}

