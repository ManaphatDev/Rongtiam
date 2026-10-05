import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const configured = !!(url && key);

let client: SupabaseClient | null = null;

export function supa(): SupabaseClient {
  if (!configured) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');
  client ??= createClient(url!, key!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}

/** Signs in anonymously once per browser; the session (and so the user id) persists in localStorage. */
export async function ensureSession(captchaToken?: string): Promise<string> {
  const s = supa();
  const { data } = await s.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await s.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
  if (error || !signed.user) throw error ?? new Error('sign-in failed');
  return signed.user.id;
}

export interface RpcError {
  code?: string;
  message: string;
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supa().rpc(fn, args);
  if (error) throw { code: error.code, message: error.message } satisfies RpcError;
  return data as T;
}
