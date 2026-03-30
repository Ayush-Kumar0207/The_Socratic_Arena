import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * 'Firewall-Resilient' Supabase Client
 * Configured with custom global fetch to handle institutional LAN timeouts
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    fetch: (url, options) => {
      return fetch(url, {
        ...options,
        // Institutional LANs often have high jitter/latency
        signal: AbortSignal.timeout(15000) // 15s timeout
      });
    }
  }
});

/**
 * Rapid Connectivity Check (Ping)
 * Used to detect if the LAN is blocking the database domain entirely
 */
export const checkSupabaseConnection = async () => {
  try {
    const start = Date.now();
    const { error } = await supabase.from('topics').select('id').limit(1);
    if (error) throw error;
    console.log(`[Network] Database reachable (${Date.now() - start}ms)`);
    return true;
  } catch (err) {
    console.error('[Network] Database unreachable on this LAN:', err);
    return false;
  }
};
