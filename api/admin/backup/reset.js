import { requireAdmin } from '../../_lib/requireAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const supabaseAdmin = ctx.admin;

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
