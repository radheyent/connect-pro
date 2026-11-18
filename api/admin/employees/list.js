import { requireAdmin } from '../../_lib/requireAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const supabaseAdmin = ctx.admin;

  try {
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (profileError) throw profileError;

    // Pull emails + phone (if set) from auth.users and merge in
    const { data: authList, error: authError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authError) throw authError;

    const authMap = {};
    (authList?.users || []).forEach(u => {
      authMap[u.id] = { email: u.email, phone: u.phone, last_sign_in_at: u.last_sign_in_at };
    });

    const merged = (profiles || []).map(p => ({
      ...p,
      email: authMap[p.id]?.email || null,
      phone: authMap[p.id]?.phone || null,
      last_sign_in_at: authMap[p.id]?.last_sign_in_at || null,
    }));

    res.status(200).json({ employees: merged });
  } catch (error) {
    console.error('Employee list error:', error);
    res.status(400).json({ error: error.message || 'Could not load employees' });
  }
}
