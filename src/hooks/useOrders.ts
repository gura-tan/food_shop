import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Order, OrderItem } from '../types';

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        items:order_items(*)
      `)
      .in('status', ['ordering', 'billing', 'cooking', 'delivering'])
      .order('id', { ascending: true });

    if (!error && data) {
      setOrders(data as Order[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();

    // Realtime: orders table changes
    const channel = supabase
      .channel('orders_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => { fetchOrders(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => { fetchOrders(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchOrders]);

  return { orders, loading, refetch: fetchOrders };
}

// Fetch recently completed orders (for kitchen tab undo feature)
export async function fetchRecentCompleted(limit = 3): Promise<Order[]> {
  const { data } = await supabase
    .from('orders')
    .select(`*, items:order_items(*)`)
    .eq('status', 'delivering')  // showing last delivering-completed ones
    .order('updated_at', { ascending: false })
    .limit(limit);
  return (data as Order[]) ?? [];
}

// Fetch completed orders for kitchen history display
export async function fetchKitchenHistory(limit = 3): Promise<Order[]> {
  const { data } = await supabase
    .from('orders')
    .select(`*, items:order_items(*)`)
    .eq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(limit);
  return (data as Order[]) ?? [];
}

export async function fetchOrderWithItems(orderId: number): Promise<Order | null> {
  const { data } = await supabase
    .from('orders')
    .select(`*, items:order_items(*)`)
    .eq('id', orderId)
    .single();
  return data as Order | null;
}

// Get next order number (max id + 1, or 1 if no orders)
export async function getNextOrderNumber(): Promise<number> {
  const { data } = await supabase
    .from('orders')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);
  if (data && data.length > 0) return (data[0] as { id: number }).id + 1;
  return 1;
}

// Upsert order items
export async function upsertOrderItems(orderId: number, items: Omit<OrderItem, 'id' | 'order_id'>[]): Promise<void> {
  // Delete old items first
  await supabase.from('order_items').delete().eq('order_id', orderId);
  if (items.length === 0) return;
  await supabase.from('order_items').insert(
    items.map(item => ({ ...item, order_id: orderId }))
  );
}
