# Mai Goro — Admin Panel Setup Guide

## Login + Slides Manager + Daily Activities Log

This package gives your website a secure admin area:

|Page|Address|Who can see it|
|-|-|-|
|Admin login|`your-site.netlify.app/admin/login.html`|Nobody until you create their account|
|Admin dashboard|`your-site.netlify.app/admin/index.html`|Logged-in admins only|
|Live slides|Loaded automatically on your homepage slider|Everyone (public can only READ)|

\---

## STEP 1 — Create your free database (Supabase)

1. Go to **https://supabase.com** → sign up (free, works with Google login).
2. Click **"New project"**.

   * Name: `maigoro-website`
   * Database password: click *Generate* and **save it somewhere safe**
   * Region: choose the closest to you
3. Wait \~2 minutes for the project to finish setting up.

## STEP 2 — Create the tables (copy-paste SQL)

1. In Supabase, click the **SQL Editor** icon in the left sidebar → **+ New query**.
2. Delete anything in the box, paste ALL of the code below, then click **RUN**:

```sql
-- Slides table (homepage opportunities)
create table slides (
  id uuid primary key default gen\\\\\\\_random\\\\\\\_uuid(),
  title text not null,
  image\\\\\\\_url text not null,
  link text,
  created\\\\\\\_at timestamptz default now()
);

-- Daily activities log
create table activities (
  id uuid primary key default gen\\\\\\\_random\\\\\\\_uuid(),
  entry\\\\\\\_date date not null default current\\\\\\\_date,
  title text not null,
  notes text,
  created\\\\\\\_at timestamptz default now()
);

-- Security rules: public can READ slides, only logged-in admins can change anything
alter table slides enable row level security;
alter table activities enable row level security;

create policy "public can view slides"   on slides for select using (true);
create policy "admins can add slides"    on slides for insert to authenticated with check (true);
create policy "admins can delete slides" on slides for delete to authenticated using (true);

create policy "admins can view activities"   on activities for select to authenticated using (true);
create policy "admins can add activities"    on activities for insert to authenticated with check (true);
create policy "admins can delete activities" on activities for delete to authenticated using (true);

-- Image storage bucket for slide flyers
insert into storage.buckets (id, name, public) values ('slide-images', 'slide-images', true);

create policy "public can view images"  on storage.objects for select using (bucket\\\\\\\_id = 'slide-images');
create policy "admins can upload images" on storage.objects for insert to authenticated with check (bucket\\\\\\\_id = 'slide-images');
create policy "admins can delete images" on storage.objects for delete to authenticated using (bucket\\\\\\\_id = 'slide-images');
```

You should see "Success. No rows returned" — that's correct.

## STEP 3 — Create YOUR admin account

1. In Supabase left sidebar → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Enter YOUR email and a strong password. **Uncheck** "Auto Confirm User" is NOT needed — just create; then click the user in the list and press **"Send confirmation email"** OR toggle email confirmed ON so you can log in immediately.
3. **Important — keep registration private:** go to **Authentication → Sign In / Providers**, and turn **OFF** "Allow new users to sign up". Now ONLY accounts you create by hand can log in. ✅ This is your "admins-only register".

## STEP 4 — Connect the website to the database

1. In Supabase → **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `admin/js/config.js` in this package and paste them over the two placeholder lines.
4. Open `public/slider-config.js` and paste the SAME two values there.

## STEP 5 — Upload to your Netlify site

1. Copy the **`admin/`** folder into your website's project folder (next to your `index.html`).
2. Copy **`public/mg-slider.js`** and **`public/slider-config.js`** into your website's folder (e.g. into a `js/` folder).
3. Commit/push (or drag-and-drop the folder into Netlify) to redeploy.

## STEP 6 — Connect the homepage slider

In your homepage `index.html`, find the whole "What is Currently Going" section.
Replace the old hardcoded slider code (the 6 slides markup + its script) with:

```html
<div id="mg-slides"></div>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/slider-config.js"></script>
<script src="js/mg-slider.js"></script>
```

(Adjust the paths if you put the files somewhere else.)

## STEP 7 — Test

1. Go to `your-site.netlify.app/admin/login.html` and log in with your admin email/password.
2. Add a test slide with a flyer image → check it appears on the homepage.
3. Record a test activity → it stays private inside the admin dashboard.
4. Delete the test slide/activity to clean up.

\---

## Adding more admins later

Supabase → Authentication → Users → Add user → create their account.
Send them `your-site.netlify.app/admin/login.html` to sign in. That's the "admin register" — done securely, no public form needed.

## Adding public user registration (LATER, when ready)

When you want students/customers to create their own accounts, turn sign-ups back ON
in Authentication settings and build a register page using `sb.auth.signUp({email, password})`.
Do this only when you actually need public accounts.

## Folder contents

```
admin/
  login.html        → admin sign-in page
  index.html        → dashboard (slides + daily activities)
  js/config.js      → paste your Supabase keys here
public/
  mg-slider.js      → homepage slider that reads slides from the database
  slider-config.js  → paste the same Supabase keys here
```

