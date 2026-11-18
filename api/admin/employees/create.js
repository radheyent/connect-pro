import { requireAdmin } from '../../_lib/requireAdmin.js';

const ALLOWED_ROLES = ['admin', 'employee', 'field_boy'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const supabaseAdmin = ctx.admin;

  try {
    const { email, password, name, role } = req.body || {};
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'email, password, name and role are all required' });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { data: userData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role },
    });
    if (authError) throw authError;

    const { error: profileError } = await supabaseAdmin.from('user_profiles').insert({
      id: userData.user.id,
      name,
      role,
      is_active: true,
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
      throw profileError;
    }

    res.status(200).json({ success: true, user: { id: userData.user.id, email, name, role } });
  } catch (error) {
    console.error('Employee creation error:', error);
    res.status(400).json({ error: error.message });
  }
}
