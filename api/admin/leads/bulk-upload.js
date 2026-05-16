import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import formidable from 'formidable';
import fs from 'fs';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const form = formidable({ maxFileSize: 10 * 1024 * 1024 });
    const [, files] = await form.parse(req);
    const uploadedFile = files.file?.[0];
    if (!uploadedFile) return res.status(400).json({ error: 'No file uploaded' });

    const buffer = fs.readFileSync(uploadedFile.filepath);
    const ext = uploadedFile.originalFilename?.split('.').pop()?.toLowerCase();

    let rows = [];
    if (ext === 'csv') {
      const text = buffer.toString('utf8');
      const lines = text.split('\n').filter(Boolean);
      const headers = lines[0].split(',').map(h => h.trim());
      rows = lines.slice(1).map(line => {
        const vals = line.split(',');
        return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim() || '']));
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    } else {
      return res.status(400).json({ error: 'Sirf CSV ya Excel (.xlsx/.xls) upload karo' });
    }

    const mappedLeads = rows.map(l => ({
      name: l.Name || l.name || '',
      phone: String(l.Phone || l.phone || ''),
      matching_number: l.MatchingNumber || l.matching_number || null,
      current_operator: l.CurrentOperator || l.current_operator || null,
      status: l.Status || l.status || 'Not Connected',
      notes: l.Notes || l.notes || null,
      important: String(l.Important || l.important || '').toLowerCase() === 'true',
      created_date: l.CreatedDate || new Date().toISOString(),
    })).filter(l => l.name && l.phone);

    if (mappedLeads.length === 0)
      return res.status(400).json({ error: 'File mein koi valid lead nahi mili. Name aur Phone column check karo.' });

    const { error } = await supabaseAdmin.from('leads').insert(mappedLeads);
    if (error) throw error;

    res.json({ success: true, count: mappedLeads.length });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ error: error.message });
  }
}
