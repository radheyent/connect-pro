import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. Only ever used on the server (Vercel functions).
 */
export function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Verifies that the caller is a logged-in, active admin.
 *
 * The browser must send:  Authorization: Bearer <supabase access token>
 *
 * Returns { admin, user } on success.
 * On failure it has already sent a 401 / 403 response and returns null,
 * so the caller should simply `return` when the result is null.
 */
export async function requireAdmin(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const admin = getAdminClient();

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'admin' || profile.is_active === false) {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }

  return { admin, user: authData.user };
}
