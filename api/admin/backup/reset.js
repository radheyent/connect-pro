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
    // 1. Fetch all leads to archive
    const { data: leadsToArchive, error: fetchError } = await supabaseAdmin
      .from('leads').select('*');
    if (fetchError) throw fetchError;

    // 2. Archive them
    if (leadsToArchive && leadsToArchive.length > 0) {
      const archiveData = leadsToArchive.map(l => ({
        original_id: l.id,
        name: l.name,
        phone: l.phone,
        status: l.status,
        assigned_to: l.assigned_to,
        archived_at: new Date().toISOString(),
        data: l
      }));
      const { error: archiveError } = await supabaseAdmin
        .from('archived_leads').insert(archiveData);
      if (archiveError) throw archiveError;
    }

    // 3. Delete all leads from main table
    if (leadsToArchive && leadsToArchive.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('leads').delete().not('id', 'is', null);
      if (deleteError) throw deleteError;
    }

    res.status(200).json({
      success: true,
      archived: leadsToArchive ? leadsToArchive.length : 0
    });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ error: error.message });
  }
}
