# Deployment and Setup Guide for Connect Pro

This guide outlines the steps required to set up the production environment for Connect Pro, including Supabase, GitHub, and Vercel.

---

## 1. Supabase Setup (Database & Auth)

Supabase is the backend for this application, providing authentication and a PostgreSQL database.

### Step 1: Create a Project
1. Go to [Supabase](https://supabase.com/) and sign in.
2. Create a new project named "Connect Pro".
3. Save your **Database Password** carefully.

### Step 2: Initialize the Database
1. Go to the **SQL Editor** in the Supabase dashboard.
2. Copy the contents of the `schema.sql` file from this repository and run it in the SQL editor. This will create all necessary tables and security policies.

### Step 3: Configure Authentication
1. Go to **Authentication** -> **Providers**.
2. Ensure "Email" is enabled.
3. (Optional) Disable "Confirm Email" if you want users to log in immediately after registration (usually managed by Admin).

### Step 4: Get API Credentials
1. Go to **Project Settings** -> **API**.
2. Copy the following:
   - `Project URL` (e.g., `https://xyz.supabase.co`)
   - `anon` / `public` Key

---

## 2. GitHub Setup

Connecting your project to GitHub enables automated deployments.

1. Create a new repository on [GitHub](https://github.com/).
2. Initialize your local project and push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial production-ready commit"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

---

## 3. Vercel Setup (Frontend Deployment)

Vercel will host your React application and handle global environment variables.

### Step 1: Import Project
1. Go to [Vercel](https://vercel.com/) and sign in with GitHub.
2. Click **Add New Project** and import the Connect Pro repository.

### Step 2: Configure Environment Variables
In the **Environment Variables** section of the Vercel deployment settings, add the following:

- `VITE_SUPABASE_URL`: (Your Supabase Project URL)
- `VITE_SUPABASE_ANON_KEY`: (Your Supabase Anon Key)

### Step 3: Deploy
1. Click **Deploy**.
2. Once finished, Vercel will provide a production URL (e.g., `https://connect-pro.vercel.app`).

---

## 4. Post-Deployment: Initial Admin Account

Since the system uses role-based access, you need to create the first Admin manually.

1. Go to **Supabase Authentication** -> **Users**.
2. Click **Add User** and create an account with your email.
3. After creating the user, go to the **Table Editor** -> `user_profiles`.
4. Find the row corresponding to your new user ID.
5. Set the `role` to `admin` and `name` to your preferred name.

Now you can log into the application with full administrative access!

---

## Final Checklist
- [ ] Supabase Tables Created (`schema.sql` executed).
- [ ] Environment Variables added to Vercel/Local `.env`.
- [ ] Admin Role assigned to your user ID in `user_profiles`.
- [ ] All "Mock Mode" indicators are gone and the app reacts to valid Supabase credentials.
