import { createClient } from '@supabase/supabase-js';
import { getClerkInstance } from '@clerk/expo';

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// ─── Dynamic JWT fetch interceptor ───────────────────────────────────────────
// Every outgoing Supabase request gets a fresh Clerk JWT injected into
// the Authorization header. getClerkInstance() accesses the singleton outside
// of React so this works at module scope. Falls back to anon-key-only headers
// when no session exists (e.g. unauthenticated storage reads, if ever needed).

async function clerkFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await getClerkInstance().session?.getToken({ template: 'supabase' });

  const headers = new Headers(init?.headers);
  headers.set('apikey', supabaseAnonKey);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}

// ─── Supabase client ─────────────────────────────────────────────────────────

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken:   false,
    persistSession:     false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: clerkFetch,
  },
});
