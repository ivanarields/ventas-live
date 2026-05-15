import { storeAuth } from './storeAuth';

export interface StoreOrderItem {
  productId: string;
  productName: string;
  price: number;
  size: string;
  quantity: number;
}

export interface CreateStoreOrderPayload {
  items: StoreOrderItem[];
  total: number;
  customerName?: string;
  customerPhone?: string;
  delivery_type?: 'retiro' | 'delivery';
  delivery_date?: string | null;
  delivery_slot?: string | null;
  delivery_address?: string | null;
  delivery_notes?: string | null;
}

export interface StoreOrder extends CreateStoreOrderPayload {
  id: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  wa_sent: boolean;
  created_at: string;
}

export const storeOrdersApi = {
  create: async (payload: CreateStoreOrderPayload): Promise<StoreOrder> => {
    const token = await storeAuth.getToken();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/store-orders', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const err: any = new Error(errData.error || `Error ${res.status} registrando pedido`);
      err.status = res.status;
      if (errData.duplicate && errData.existingOrderId) {
        err.duplicate = true;
        err.existingOrderId = errData.existingOrderId;
        err.expiresAt = errData.expiresAt;
        err.total = errData.total;
      }
      throw err;
    }
    return res.json();
  },

  getAll: async (token: string): Promise<StoreOrder[]> => {
    const res = await fetch('/api/store-orders', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  },

  updateStatus: async (
    id: number,
    status: StoreOrder['status'],
    token: string
  ): Promise<void> => {
    const res = await fetch(`/api/store-orders/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Error actualizando pedido');
  },

  markWaSent: async (id: number, token: string): Promise<void> => {
    const res = await fetch(`/api/store-orders/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ wa_sent: true }),
    });
    if (!res.ok) throw new Error('Error marcando WhatsApp enviado');
  },
};
