import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

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
    res.status(400).json({ error: error.message || 'Employees load nahi ho paaye' });
  }
}
