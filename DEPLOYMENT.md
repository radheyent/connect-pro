# Connect Pro — Deployment Guide

## Stack
| Layer | Service |
|-------|---------|
| Frontend | React + Vite + TypeScript |
| Database + Auth | Supabase |
| Deployment | Vercel |
| Realtime | Supabase Realtime |

---

## Prerequisites
- [GitHub](https://github.com) account
- [Supabase](https://supabase.com) account (free)
- [Vercel](https://vercel.com) account (free)

---

## Step 1 — Supabase Setup

### 1.1 Create Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a name (e.g. `connect-pro`) and strong DB password
3. Wait for project to be ready (~2 min)

### 1.2 Run Database SQL
1. Supabase Dashboard → **SQL Editor** → **New Query**
2. Open `complete-setup.sql` from this repo
3. Paste the entire content → Click **Run**
4. Confirm at the bottom: all tables and policies are listed

### 1.3 Create Admin User
1. Supabase → **Authentication** → **Users** → **Add User**
2. Enter admin email + password
3. Toggle **"Auto Confirm User"** ON → Create
4. Copy the **UUID** from the users list
5. Go back to SQL Editor, run:
```sql
INSERT INTO public.user_profiles (id, name, role, is_active)
VALUES ('PASTE-UUID-HERE', 'Admin', 'admin', true);
```

### 1.4 Disable Email Confirmations
Supabase → **Authentication** → **Settings**
- **Enable email confirmations** → **OFF**

### 1.5 Get API Keys
Supabase → **Project Settings** → **API**

Note down:
- **Project URL** → `https://xxxx.supabase.co`
- **anon / public** key
- **service_role** secret key (keep this private)

---

## Step 2 — GitHub Setup

1. Fork or push this repo to your GitHub account
2. **Recommended:** Make repo **Private**
   - Settings → Danger Zone → Change visibility → Private
   - Vercel can still deploy private repos

---

## Step 3 — Vercel Setup

### 3.1 Import Project
1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. **Import Git Repository** → select your `connect-pro` repo
3. Framework: **Vite** (auto-detected)

### 3.2 Environment Variables
Before deploying, add these in Vercel:

| Variable | Value | Environment |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Production + Preview |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbG...` (anon key) | Production + Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...` (service_role key) | Production + Preview |

> Note: Development environment will show "Sensitive variables cannot be added" — that is normal, ignore it.

### 3.3 Deploy
Click **Deploy** → Wait ~2 minutes → Your app is live!

### 3.4 Redeploy (after any code change)
- Push to GitHub → Vercel auto-deploys
- Or: Vercel → Deployments → Latest → **⋯** → **Redeploy** (uncheck "Use build cache")

---

## Step 4 — Vercel + GitHub Permissions (if repo not found)

If Vercel says "repository not found":
1. GitHub → Settings → Applications → **Authorized GitHub Apps**
2. Find **Vercel** → **Configure**
3. Repository access → Select your `connect-pro` repo → **Save**

---

## Adding Employees

Employees cannot self-register. Admin must create them:

**Option A — From App (Recommended)**
1. Login as Admin → Employee Management → Add Employee
2. Fill name, email, password, role → Submit

**Option B — Manual (Supabase)**
1. Supabase → Authentication → Users → Add User (auto-confirm ON)
2. Copy UUID → SQL Editor:
```sql
INSERT INTO public.user_profiles (id, name, role, is_active)
VALUES ('UUID', 'Employee Name', 'employee', true);
```

---

## Uploading Leads via Excel/CSV

Format your file with these columns:

| Column | Required | Notes |
|--------|----------|-------|
| `Name` | ✅ | Lead's full name |
| `Phone` | ✅ | Phone number |
| `AssignedTo` | Optional | Employee's exact name (as in app) |
| `MatchingNumber` | Optional | |
| `CurrentOperator` | Optional | |
| `Status` | Optional | Default: `Not Connected` |
| `Notes` | Optional | |
| `Important` | Optional | `true` or `false` |

Admin → Lead Management → Upload Excel/CSV

---

## Monthly Reset

Admin → Backup → **Monthly Reset**

What it does:
1. Archives all current leads to `archived_leads` table
2. Deletes all leads from main `leads` table
3. Start fresh for new month

> ⚠️ This is irreversible. Export backup first.

---

## PWA — Install on Phone

1. Open your Vercel URL in Chrome/Safari on mobile
2. Browser will show **"Add to Home Screen"** banner
3. Or: browser menu → **Install App** / **Add to Home Screen**

App name: **Connect Pro** | Short name: **CPro**

---

## Roles

| Role | Access |
|------|--------|
| `admin` | Full access — employees, leads, reports, backup |
| `employee` | Assigned leads only — call log, status update, WhatsApp share |
| `field_boy` | Interested leads only — full detail view, resubmit |

---

## Fake Call Detection

Calls under **10 seconds** are automatically flagged as fake calls.
Admin can review them in **Fake Calls Panel**.

---

## Troubleshooting

**Login works but data not showing**
→ Run `complete-setup.sql` again in Supabase SQL Editor

**"Failed to fetch" errors**
→ Check Vercel env variables are set correctly (Production + Preview)
→ Redeploy without build cache

**Employee can't login**
→ Supabase → Auth → Settings → Email confirmations OFF
→ Confirm user_profiles row exists for that user

**Celebration not showing**
→ Supabase → SQL Editor → Run the trigger section from `complete-setup.sql`

---

## Environment Variables Reference

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> `VITE_` prefix is required for Vite to expose variables to frontend.
> `SUPABASE_SERVICE_ROLE_KEY` is server-only (used in `/api` routes only).
