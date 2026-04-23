// ============================================================================
// types.ts — Tipos compartidos de la aplicación Ventas Live
// Extraídos de App.tsx durante el refactor. Importar desde aquí.
// ============================================================================

export interface SupabaseUser {
  id: string;
  email?: string;
}

export interface LiveSession {
  id: string;
  title: string;
  scheduledAt: any;
  duration: number;
  status: 'scheduled' | 'live' | 'completed';
  notes?: string;
}

export interface Giveaway {
  id: string;
  title: string;
  liveId: string;
  prize: string;
  status: 'active' | 'closed';
  winnerId?: string;
}

export interface Order {
  id: string;
  customerName: string;
  whatsapp: string;
  total: number;
  items: string;
  status: 'pending' | 'paid' | 'shipped' | 'delivered';
  paymentMethod: string;
  date: any;
}

export interface Item {
  id: string;
  name: string;
  amount: number;
  category: any;
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  subcategory?: string;
  description: string;
  date: any;
  isOcr?: boolean;
  account?: string;
  beneficiary?: string;
  tags?: string;
  status?: 'paid' | 'pending';
  isRecurring?: boolean;
}

export interface Payment {
  id: string;
  nombre: string;
  pago: number;
  date: any;
  status?: string;
  method?: string;
  verified?: boolean;
  customerId?: string;
}

export interface Customer {
  id: string;
  name: string;
  canonicalName?: string;
  phone: string;
  activeLabel: string;
  totalSpent: number;
  totalItems: number;
  pendingItems: number;
  deliveredItems: number;
  createdAt: any;
}

export interface Pedido {
  id: string;
  customerId: string;
  customerName?: string;
  date: any;
  itemCount: number;
  bagCount: number;
  label: string;
  labelType?: string;
  totalAmount: number;
  status: string;
  paymentIds?: string[];
}

export interface Idea {
  id: string;
  content: string;
  createdAt: any;
  category?: string;
}

export interface Subcategory {
  id: string;
  name: string;
  icon: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  type: 'income' | 'expense';
  color: string;
  subcategories: Subcategory[];
}

export const FINANCE_CATEGORIES = [
  'Comida', 'Transporte', 'Casa', 'Ropa', 'Educación',
  'Entretenimiento', 'Servicios', 'Deudas', 'Seguro',
  'Impuestos', 'Personal', 'Otros'
];
