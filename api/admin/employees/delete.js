import { requireAdmin } from '../../_lib/requireAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const supabaseAdmin = ctx.admin;

  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Employee id is required' });
    if (id === ctx.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    // Delete profile row first (in case of FK constraints), then the auth user
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .delete()
      .eq('id', id);
    if (profileError) throw profileError;

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authError) throw authError;

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Employee delete error:', error);
    res.status(400).json({ error: error.message || 'Delete failed' });
  }
}
