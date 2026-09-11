// ============================================================
// Type definitions for Food Stall Order Management System
// ============================================================

export type OrderStatus = 'ordering' | 'billing' | 'cooking' | 'delivering' | 'completed';
export type TicketStatus = 'unused' | 'in_use';

export interface Menu {
  id: string;
  name: string;
  price: number;
  sort_order: number;
  created_at: string;
}

export interface Order {
  id: number; // = 注文番号
  ticket_number: number;
  status: OrderStatus;
  device_name: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: number;
  menu_id: string | null;
  menu_name: string;
  unit_price: number;
  quantity: number;
}

export interface Ticket {
  number: number;
  status: TicketStatus;
  order_id: number | null;
}

export interface Settings {
  ticket_max: number;
  next_ticket_number: number;
}

export interface CashierHold {
  device_name: string;
  ticket_number: number;
  joined_at: string;
  updated_at: string;
}

export interface Log {
  id: string;
  device_name: string;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

// Cart item (local state on cashier tab)
export interface CartItem {
  menu_id: string;
  menu_name: string;
  unit_price: number;
  quantity: number;
}
