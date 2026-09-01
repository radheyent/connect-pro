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
    const { id, name, role, email, password } = req.body;
    if (!id) return res.status(400).json({ error: 'Employee id required hai' });

    // Update profile fields (name/role) if provided
    const profileUpdate = {};
    if (name) profileUpdate.name = name;
    if (role) profileUpdate.role = role;
    if (Object.keys(profileUpdate).length) {
      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .update(profileUpdate)
        .eq('id', id);
      if (profileError) throw profileError;
    }

    // Update auth fields (email/password) if provided
    const authUpdate = {};
    if (email) authUpdate.email = email;
    if (password) authUpdate.password = password;
    if (Object.keys(authUpdate).length) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, authUpdate);
      if (authError) throw authError;
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Employee update error:', error);
    res.status(400).json({ error: error.message || 'Update fail ho gaya' });
  }
}
