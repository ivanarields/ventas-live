import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabase] Variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY no definidas. " +
    "El sistema de etiquetas no funcionará hasta que se configuren."
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: { persistSession: false },
});

export type ContainerType = "NUMERIC_SHARED" | "ALPHA_COMPLEX";
export type ContainerState = "AVAILABLE" | "PARTIAL" | "FULL" | "BLOCKED" | "MAINTENANCE";
export type LogisticsType = "SIMPLE" | "COMPLEX";
export type OrderStatus = "IN_PROCESS" | "READY" | "DELIVERED" | "CANCELLED";
export type AllocationStatus = "ACTIVE" | "RELEASED" | "MIGRATED" | "CANCELLED";

export interface StorageContainer {
  id: number;
  container_code: string;
  container_type: ContainerType;
  max_simple_orders: number;
  max_bags_capacity: number;
  current_simple_orders: number;
  current_bags_used: number;
  state: ContainerState;
  priority_order: number;
}

export interface OrderRow {
  id: number;
  customer_id: number;
  order_code: string;
  logistics_type: LogisticsType;
  total_bags: number;
  total_items: number;
  order_status: OrderStatus;
  total_amount: number;
}

export interface AllocationRow {
  id: number;
  container_id: number;
  order_id: number;
  allocation_type: "SIMPLE_SHARED" | "COMPLEX_CONTAINER";
  bags_reserved: number;
  status: AllocationStatus;
  assigned_at: string;
  released_at: string | null;
  release_reason: string | null;
}
