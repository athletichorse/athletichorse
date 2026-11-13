# Setup / الإعداد

## 1. Supabase (new project) — مشروع Supabase جديد
1. https://supabase.com/dashboard/new → Name: `saudi-portal`, Region: **Middle East (Riyadh / me-central-1)** if offered, else Frankfurt. Save the DB password in your password manager.
2. Project → **SQL Editor** → New query → paste `supabase/migrations/0001_core.sql` → **Run**.
3. Project → **Settings → API**: copy *Project URL*, *anon key*, *service_role key* (secret!).
4. **Authentication → Sign In / Providers → Email**: turn **off** "Confirm email" and **off** "Allow new users to sign up" (staff are created by the owner only).

## 2. Vercel (new project) — مشروع Vercel جديد
1. https://vercel.com/new → Import the GitHub repo → Framework: Next.js (auto).
2. **Environment Variables** (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key
   - `SETUP_SECRET` = a long random phrase (≥ 12 characters)
3. Deploy. Settings → General → Node.js 22.

## 3. First owner — المالك الأول
Open `https://<your-app>.vercel.app/setup`, type the SETUP_SECRET, create the owner.
The page locks itself after the first account. Then delete `SETUP_SECRET` in Vercel.
