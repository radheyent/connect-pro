import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name || !role)
      return res.status(400).json({ error: 'email, password, name, role - sab required hain' });

    const { data: userData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role }
    });
    if (authError) throw authError;

    const { error: profileError } = await supabaseAdmin.from('user_profiles').insert({
      id: userData.user.id,
      name,
      role,
      is_active: true
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
