import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Settings } from '../types';

const DEFAULT_SETTINGS: Settings = {
  ticket_max: 15,
  next_ticket_number: 1,
};

function parseSettings(rows: { key: string; value: string }[]): Settings {
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return {
    ticket_max: parseInt(map['ticket_max'] ?? '15', 10),
    next_ticket_number: parseInt(map['next_ticket_number'] ?? '1', 10),
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    const { data, error } = await supabase.from('settings').select('key, value');
    if (!error && data) {
      setSettings(parseSettings(data as { key: string; value: string }[]));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();

    const channel = supabase
      .channel('settings_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'settings' },
        () => { fetchSettings(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchSettings]);

  return { settings, loading, refetch: fetchSettings };
}
