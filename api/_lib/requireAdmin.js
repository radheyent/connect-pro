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

function deny(res, status, message, logDetail) {
  console.error('[requireAdmin]', status, message, logDetail || '');
  res.status(status).json({ error: message });
  return null;
}

/**
 * Verifies that the caller is a logged-in, active admin.
 *
 * The browser must send:  Authorization: Bearer <supabase access token>
 *
 * Returns { admin, user } on success.
 * On failure it has already sent a 401 / 403 response that says WHY, and returns null,
 * so the caller should simply `return` when the result is null.
 */
export async function requireAdmin(req, res) {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return deny(
      res, 500,
      'Server setup problem: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in the Vercel environment variables.'
    );
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return deny(res, 401, 'Authentication required (no session token was sent). Please log out and log in again.');
  }

  const admin = getAdminClient();

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) {
    return deny(res, 401, 'Invalid or expired session. Please log out and log in again.', authError?.message);
  }

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError) {
    return deny(
      res, 403,
      `Admin check failed: the profile could not be read (${profileError.message}). Check SUPABASE_SERVICE_ROLE_KEY in Vercel.`,
      profileError.message
    );
  }
  if (!profile) {
    return deny(res, 403, 'Admin access required (no profile was found for this account).');
  }
  if (String(profile.role || '').toLowerCase() !== 'admin') {
    return deny(res, 403, `Admin access required (this account's role is "${profile.role}").`);
  }
  if (profile.is_active === false) {
    return deny(res, 403, 'Admin access required (this account is disabled).');
  }

  return { admin, user: authData.user };
}
