import { supabase } from '@/lib/supabase';

/**
 * fetch() for the /api/admin/* endpoints.
 * Adds the logged-in user's access token so the server can verify the caller is an admin.
 */
export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}
