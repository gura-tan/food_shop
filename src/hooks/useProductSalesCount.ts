import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface ProductSalesCount {
  chocoBanana: number;
  strawberryBanana: number;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useProductSalesCount(): ProductSalesCount {
  const [chocoBanana, setChocoBanana] = useState(0);
  const [strawberryBanana, setStrawberryBanana] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    try {
      // 調理中(cooking)、受け渡し中(delivering)、受取済み(completed)の注文を取得
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          status,
          items:order_items (
            menu_name,
            quantity
          )
        `)
        .in('status', ['cooking', 'delivering', 'completed']);

      if (error) {
        console.warn('[useProductSalesCount] fetch error:', error);
        return;
      }

      let chocoCount = 0;
      let strawberryCount = 0;

      if (data) {
        for (const order of data) {
          if (order.items && Array.isArray(order.items)) {
            for (const item of order.items) {
              const name = item.menu_name?.trim();
              if (name === 'チョコバナナ') {
                chocoCount += Number(item.quantity) || 0;
              } else if (name === 'いちごバナナ') {
                strawberryCount += Number(item.quantity) || 0;
              }
            }
          }
        }
      }

      setChocoBanana(chocoCount);
      setStrawberryBanana(strawberryCount);
    } catch (err) {
      console.warn('[useProductSalesCount] unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();

    // orders, order_items, settings テーブルの変更（作成・ステータス更新・削除・リセット等）をリアルタイム購読
    const channel = supabase
      .channel('sales_count_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          fetchCounts();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => {
          fetchCounts();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        () => {
          fetchCounts();
        }
      )
      .subscribe();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchCounts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [fetchCounts]);

  return {
    chocoBanana,
    strawberryBanana,
    loading,
    refetch: fetchCounts,
  };
}
