import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import dotenv from 'dotenv';

dotenv.config();

interface MulterRequest extends express.Request {
  file?: Express.Multer.File;
}

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

app.use(express.json());

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Bulk Upload Leads (CSV/Excel)
app.post('/api/admin/leads/bulk-upload', upload.single('file'), async (req: MulterRequest, res: express.Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let leads = [];
    const extension = path.extname(req.file.originalname).toLowerCase();

    if (extension === '.csv') {
      leads = parse(req.file.buffer.toString(), {
        columns: true,
        skip_empty_lines: true,
      });
    } else if (extension === '.xlsx' || extension === '.xls') {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      leads = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else {
      return res.status(400).json({ error: 'Unsupported file format' });
    }

    // Mapping and Validation
    // Expected Headers: Name, Phone, MatchingNumber, CurrentOperator, Status, AssignedTo, AddedBy, LastCallDate, Notes, Important, CreatedDate, CompletedDate, CallDuration
    const mappedLeads = leads.map((l: any) => ({
      name: l.Name || '',
      phone: String(l.Phone) || '',
      matching_number: l.MatchingNumber || null,
      current_operator: l.CurrentOperator || null,
      status: l.Status || 'Not Connected',
      assigned_to: l.AssignedTo || null,
      added_by: l.AddedBy || null,
      last_call_date: l.LastCallDate || null,
      notes: l.Notes || null,
      important: String(l.Important).toLowerCase() === 'true',
      created_date: l.CreatedDate || new Date().toISOString(),
      completed_date: l.CompletedDate || null,
      last_call_duration: parseInt(l.CallDuration) || 0,
    }));

    const { data, error } = await supabaseAdmin.from('leads').insert(mappedLeads);
    if (error) throw error;

    res.json({ success: true, count: mappedLeads.length });
  } catch (error: any) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export Leads to Excel (Backup)
app.get('/api/admin/backup/export', async (req, res) => {
  try {
    const { data: sales, error: salesError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('status', 'Complete');

    const { data: activity, error: activityError } = await supabaseAdmin
      .from('call_attempts')
      .select('*, leads(name, phone)');

    if (salesError || activityError) throw salesError || activityError;

    const workbook = XLSX.utils.book_new();
    const salesSheet = XLSX.utils.json_to_sheet(sales);
    const activitySheet = XLSX.utils.json_to_sheet(activity);

    XLSX.utils.book_append_sheet(workbook, salesSheet, 'Sales (Completed)');
    XLSX.utils.book_append_sheet(workbook, activitySheet, 'Activity');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=connect_pro_backup.xlsx');
    res.send(buffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Monthly Reset & Archive
app.post('/api/admin/backup/reset', async (req, res) => {
  try {
    // 1. Fetch leads to archive (e.g. all leads from last month or completed ones)
    const { data: leadsToArchive, error: fetchError } = await supabaseAdmin
      .from('leads')
      .select('*');
    
    if (fetchError) throw fetchError;

    // 2. Insert into archived_leads
    const archiveData = leadsToArchive.map(l => ({
        original_id: l.id,
        name: l.name,
        phone: l.phone,
        status: l.status,
        assigned_to: l.assigned_to,
        data: l
    }));

    if (archiveData.length > 0) {
        const { error: archiveError } = await supabaseAdmin.from('archived_leads').insert(archiveData);
        if (archiveError) throw archiveError;
    }

    // 3. Reset logic: Clear leads or move them
    // For this app, maybe we just reset pending_recall and delete only what is archived if intended.
    // The prompt says "auto-backup current month, archive old leads to archived_leads, reset pending_recall".
    const { error: resetError } = await supabaseAdmin
        .from('leads')
        .update({ pending_recall: false })
        .not('id', 'is', null);

    if (resetError) throw resetError;

    res.json({ success: true, archived: archiveData.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create Employee (Admin Only)
app.post('/api/admin/employees/create', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    // 1. Create Auth User
    const { data: userData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role }
    });

    if (authError) throw authError;

    // 2. Create Profile
    const { error: profileError } = await supabaseAdmin.from('user_profiles').insert({
      id: userData.user.id,
      name,
      role,
      is_active: true
    });

    if (profileError) throw profileError;

    res.json({ success: true, user: userData.user });
  } catch (error: any) {
    console.error('Employee creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
