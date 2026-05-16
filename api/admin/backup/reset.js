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
    const { data: leads, error: fetchError } = await supabaseAdmin.from('leads').select('*');
    if (fetchError) throw fetchError;

    if (leads && leads.length > 0) {
      const archiveData = leads.map(l => ({
        original_id: l.id,
        name: l.name,
        phone: l.phone,
        status: l.status,
        assigned_to: l.assigned_to,
        data: l
      }));
      const { error: archiveError } = await supabaseAdmin.from('archived_leads').insert(archiveData);
      if (archiveError) throw archiveError;
    }

    const { error: resetError } = await supabaseAdmin
      .from('leads')
      .update({ pending_recall: false })
      .not('id', 'is', null);
    if (resetError) throw resetError;

    res.status(200).json({ success: true, archived: leads ? leads.length : 0 });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ error: error.message });
  }
}
