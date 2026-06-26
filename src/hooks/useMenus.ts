import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Menu } from '../types';

export function useMenus() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMenus = useCallback(async () => {
    const { data, error } = await supabase
      .from('menus')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (!error && data) {
      setMenus(data as Menu[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  return { menus, loading, refetch: fetchMenus };
}
