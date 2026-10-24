# PortfolioHub

> **A professional portfolio builder platform** — create stunning, customizable portfolios in minutes using one of six handcrafted templates, share your work with the world, and connect with a thriving creative community.

---

## Table of Contents

- [What is PortfolioHub?](#what-is-portfoliohub)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
  - [1. Clone / Download](#1-clonedownload-the-project)
  - [2. Create a Supabase Project](#2-create-a-supabase-project)
  - [3. Configure Credentials](#3-configure-credentials)
  - [4. Run the SQL Migration](#4-run-the-sql-migration)
  - [5. Configure Supabase Storage](#5-configure-supabase-storage)
  - [6. Configure Supabase Auth](#6-configure-supabase-auth)
  - [7. Run Locally](#7-run-locally)
  - [8. Deployment](#8-deployment)
- [Public Portfolio URLs](#public-portfolio-urls)
- [Supabase RLS Security Model](#supabase-rls-security-model)
- [Environment Variables / Config Values](#environment-variables--config-values)
- [Known Limitations](#known-limitations)
- [License](#license)

---

## What is PortfolioHub?

PortfolioHub is a **fully client-side, no-build-step** portfolio platform built with plain HTML, CSS, and Vanilla JavaScript backed by [Supabase](https://supabase.com) as its backend-as-a-service. Users register, pick one of six professionally designed templates, fill in their details (bio, skills, projects, social links), and instantly get a shareable public portfolio URL.

Beyond individual portfolios, PortfolioHub features a **community feed** where users publish posts and interact with each other, an **Explore** page to discover outstanding portfolios, a **job-board integration**, and a rich **dashboard** for managing every aspect of a user's online presence.

---

## Features

### Authentication & Accounts
- Email / password sign-up and sign-in
- Persistent sessions via Supabase Auth JWTs
- Protected routes — unauthenticated users are redirected to the login page
- User profile with avatar, cover photo, bio, location, website, and social links

### Portfolio Builder
- **6 unique templates**: Minimal, Creative, Professional, Developer, Artistic, and Bold
- Live template preview before committing
- Rich project showcase: title, description, technologies, GitHub/live links, cover image
- Skills section with proficiency levels
- Education & work-experience timeline
- Custom sections (certifications, publications, awards, etc.)
- Shareable public portfolio URL (`/u/<slug>`)

### Explore
- Browse and search all public portfolios
- Filter by template style, skills, or industry
- Featured / trending portfolios curated section

### Community Feed
- Create text + image posts
- Like and comment on posts
- Follow / unfollow other users
- Real-time-style feed sorted by recency

### Dashboard
- Portfolio analytics (view counts, profile visits)
- Quick-edit panel for every portfolio section
- Manage uploaded media (avatars, project images)
- Notification centre

### Jobs (optional module)
- Browse community-posted job opportunities
- Post jobs linked to your portfolio profile

### Miscellaneous
- Fully responsive — mobile, tablet, desktop
- Dark / light mode toggle (per-user preference stored in Supabase)
- Row-Level Security on every table — users can only mutate their own data
- Storage policies per-bucket for avatars, covers, project images, and community images

---

## Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 (semantic) |
| Styling | CSS3 (custom properties, Flexbox, Grid, animations) |
| Scripting | Vanilla JavaScript ES6+ (modules, async/await) |
| Backend | [Supabase](https://supabase.com) — Auth, PostgreSQL, Storage, Realtime |
| Icons | [Lucide Icons](https://lucide.dev) via CDN |
| Supabase SDK | `@supabase/supabase-js@2` via CDN ESM import |

**No build step. No framework. No TypeScript. No bundler.** Open `index.html` with any HTTP server and it works.

---

## Project Structure

```
portfoliohub/
│
├── index.html                  # Landing / marketing page (unauthenticated)
├── login.html                  # Sign-in page
├── register.html               # Sign-up / create account page
├── dashboard.html              # Main authenticated dashboard
├── portfolio-builder.html      # Step-by-step portfolio editor
├── templates.html              # Template gallery & picker
├── public-portfolio.html       # Public-facing rendered portfolio (SEO page)
├── explore.html                # Discover & search public portfolios
├── community.html              # Community feed (posts, likes, comments)
├── profile.html                # User profile / settings page
├── jobs.html                   # Job board
│
├── _redirects                  # Netlify URL rewrite rules
├── vercel.json                 # Vercel URL rewrite rules
├── README.md                   # ← you are here
│
├── css/
│   ├── global.css              # CSS custom properties, resets, typography
│   ├── components.css          # Reusable UI components (buttons, cards, modals)
│   ├── dashboard.css           # Dashboard layout & widgets
│   ├── portfolio-builder.css   # Builder wizard styles
│   ├── templates.css           # Template preview grid
│   ├── public-portfolio.css    # Rendered portfolio base styles
│   ├── explore.css             # Explore grid & filters
│   ├── community.css           # Feed, post cards, comments
│   ├── profile.css             # Profile settings page
│   ├── jobs.css                # Job board styles
│   ├── auth.css                # Login / Register forms
│   └── templates/
│       ├── minimal.css         # Minimal template styles
│       ├── creative.css        # Creative template styles
│       ├── professional.css    # Professional template styles
│       ├── developer.css       # Developer template styles
│       ├── artistic.css        # Artistic template styles
│       └── bold.css            # Bold template styles
│
├── js/
│   ├── config.js               # ⚠️ Supabase URL + anon key (edit this!)
│   ├── supabase-client.js      # Initialises and exports the Supabase client
│   ├── auth.js                 # Auth helpers (login, register, logout, session)
│   ├── router.js               # Client-side route guard
│   ├── dashboard.js            # Dashboard data loading & widgets
│   ├── portfolio-builder.js    # Builder wizard logic
│   ├── templates.js            # Template selection logic
│   ├── public-portfolio.js     # Renders a portfolio from DB data
│   ├── explore.js              # Search, filter, paginate portfolios
│   ├── community.js            # Feed CRUD, likes, comments
│   ├── profile.js              # Profile settings save/load
│   ├── jobs.js                 # Job board logic
│   └── utils.js                # Shared helpers (slugify, sanitize, toast, etc.)
│
└── supabase/
    └── migrations/
        ├── schema.sql          # Full DB schema + RLS policies
        └── storage-policies.sql # Storage bucket creation + policies
```

---

## Prerequisites

- **A Supabase account** — the free tier (Hobby plan) is sufficient for development and small-scale production.
  Sign up at [https://supabase.com](https://supabase.com).
- **A local HTTP server** — you cannot open the HTML files with `file://` because ES modules and Supabase auth redirects require an `http://` origin.
  Choose any option you prefer:
  - **VS Code Live Server** extension (easiest)
  - `npx serve .`
  - `npx http-server .`
  - `python -m http.server 8080`
- **Git** (optional, for cloning)
- **Node.js** (optional, only needed if you use `npx serve` / `npx http-server`)

---

## Setup Instructions

### 1. Clone/Download the Project

**Option A — Git clone:**
```bash
git clone https://github.com/your-username/portfoliohub.git
cd portfoliohub
```

**Option B — Download ZIP:**
1. Click **Code → Download ZIP** on GitHub.
2. Extract the ZIP to a folder of your choice (e.g. `C:\Projects\portfoliohub`).

---

### 2. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New project**.
3. Fill in:
   - **Organization**: select or create one.
   - **Project name**: e.g. `portfoliohub`.
   - **Database password**: choose a strong password and **save it somewhere safe**.
   - **Region**: pick the region closest to your users.
4. Click **Create new project** and wait ~2 minutes for provisioning.
5. Once the dashboard loads, navigate to **Project Settings → API**.
6. Copy the following two values — you will need them in the next step:
   - **Project URL** — looks like `https://xyzxyzxyz.supabase.co`
   - **anon / public key** — a long JWT string

---

### 3. Configure Credentials

Open [`js/config.js`](js/config.js) in any text editor:

```js
// js/config.js
export const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
```

Replace the placeholder strings with your actual **Project URL** and **anon key** from the previous step. Save the file.

> ⚠️ **Security note**: The `anon` key is safe to expose in client-side code — it is designed for public use. Supabase's Row-Level Security policies enforce data access control on the server. Never commit or expose your `service_role` key.

---

### 4. Run the SQL Migration

This step creates all tables, indexes, functions, and Row-Level Security policies in your Supabase PostgreSQL database.

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open the file [`supabase/migrations/schema.sql`](supabase/migrations/schema.sql) from your local project folder.
4. Copy the **entire contents** of `schema.sql`.
5. Paste it into the Supabase SQL Editor.
6. Click **Run** (or press `Ctrl + Enter`).
7. Verify there are no errors in the output panel at the bottom. You should see multiple `CREATE TABLE`, `CREATE POLICY`, and `CREATE FUNCTION` confirmations.

---

### 5. Configure Supabase Storage

PortfolioHub uses **4 storage buckets**. You can create them either via the SQL migration (see [`supabase/migrations/storage-policies.sql`](supabase/migrations/storage-policies.sql)) or manually in the dashboard. The SQL approach is recommended:

1. In the **SQL Editor**, open a **New query**.
2. Open [`supabase/migrations/storage-policies.sql`](supabase/migrations/storage-policies.sql).
3. Copy and paste the entire file contents.
4. Click **Run**.

This creates and configures all 4 buckets:

| Bucket | Purpose | Public? |
|--------|---------|---------|
| `avatars` | User profile pictures | ✅ Yes |
| `covers` | Portfolio cover / hero images | ✅ Yes |
| `project-images` | Individual project screenshots | ✅ Yes |
| `community-images` | Images attached to community posts | ✅ Yes |

**If you prefer to create buckets manually:**

1. In the Supabase dashboard go to **Storage → Buckets**.
2. Click **New bucket**, enter the name (`avatars`), enable **Public bucket**, click **Create bucket**.
3. Repeat for `covers`, `project-images`, and `community-images`.
4. After creating all buckets, run only the `CREATE POLICY` statements from `storage-policies.sql` in the SQL Editor.

**File size limits** (configured in storage-policies.sql):
- Avatars: **2 MB** max
- Covers: **5 MB** max
- Project images: **5 MB** max
- Community images: **3 MB** max

**Allowed MIME types:**
- All image buckets accept: `image/jpeg`, `image/png`, `image/webp`, `image/gif`

---

### 6. Configure Supabase Auth

1. In your Supabase dashboard, go to **Authentication → Providers**.
2. Ensure **Email** is enabled (it is by default).

**Set Redirect URLs:**

1. Go to **Authentication → URL Configuration**.
2. In **Site URL**, enter your local development URL:
   ```
   http://localhost:5500
   ```
   (Adjust the port to match your local server — Live Server defaults to `5500`.)
3. In **Redirect URLs**, add:
   ```
   http://localhost:5500/**
   http://localhost:8080/**
   http://localhost:3000/**
   ```
4. When you deploy to production, also add your production URL:
   ```
   https://your-site.netlify.app/**
   https://your-custom-domain.com/**
   ```
5. Click **Save**.

**Disable email confirmation for development (optional but recommended):**

1. Go to **Authentication → Settings**.
2. Scroll to **Email Auth**.
3. Toggle **off** "Enable email confirmations".
4. Click **Save**.

> 📝 Re-enable email confirmations before going to production so real users must verify their addresses.

---

### 7. Run Locally

Choose any of the following methods:

**VS Code Live Server (recommended for beginners):**
1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) VS Code extension.
2. Open the `portfoliohub` folder in VS Code.
3. Right-click `index.html` → **Open with Live Server**.
4. Your browser opens at `http://127.0.0.1:5500/index.html`.

**Using `npx serve` (Node.js required):**
```bash
cd "c:\Users\MSi\Desktop\final project\portfoliohub"
npx serve .
# Open http://localhost:3000
```

**Using `npx http-server` (Node.js required):**
```bash
cd "c:\Users\MSi\Desktop\final project\portfoliohub"
npx http-server . -p 8080 -o
# Open http://localhost:8080
```

**Using Python:**
```bash
cd "c:\Users\MSi\Desktop\final project\portfoliohub"
python -m http.server 8080
# Open http://localhost:8080
```

Navigate to `http://localhost:<port>/index.html` and you should see the PortfolioHub landing page.

---

### 8. Deployment

#### Netlify (Recommended — easiest)

**Option A — Drag & Drop:**
1. Go to [https://app.netlify.com](https://app.netlify.com) and log in.
2. Click **Add new site → Deploy manually**.
3. Drag and drop the entire `portfoliohub` folder onto the upload zone.
4. Netlify deploys instantly and gives you a URL like `https://portfoliohub-xyz.netlify.app`.

**Option B — Git Integration:**
1. Push the project to a GitHub/GitLab/Bitbucket repository.
2. In Netlify: **Add new site → Import an existing project**.
3. Authorise and select your repository.
4. Build settings:
   - **Build command**: *(leave empty — no build step)*
   - **Publish directory**: `.` (or `portfoliohub` if that is the repo subfolder)
5. Click **Deploy site**.

**URL Rewrites for clean portfolio URLs:**

The `_redirects` file (already in the project root) tells Netlify to rewrite `/u/john-doe` to `/public-portfolio.html?u=john-doe`:

```
/u/:slug  /public-portfolio.html?u=:slug  200
```

This is already set up — no additional configuration is needed.

---

#### Vercel

1. Install Vercel CLI (optional): `npm i -g vercel`
2. From the project folder: `vercel`
3. Follow the prompts. Leave the build command empty and set the output directory to `.`.

Or use the **Vercel dashboard → Import Git Repository**.

The `vercel.json` file (already in the project root) handles URL rewrites:

```json
{
  "rewrites": [
    { "source": "/u/:slug", "destination": "/public-portfolio.html?u=:slug" }
  ]
}
```

---

#### GitHub Pages

1. Push the project to a GitHub repository.
2. Go to **Settings → Pages**.
3. Set **Source** to `Deploy from a branch`, select the `main` branch and `/ (root)` folder.
4. Click **Save**. GitHub builds and serves the site at `https://username.github.io/repo-name/`.

> ⚠️ **GitHub Pages limitation**: GitHub Pages does not support server-side URL rewrites. The clean `/u/:slug` URLs will **not** work — users will get 404 errors. Portfolio links will still work when accessed as `public-portfolio.html?u=slug`. If you need clean URLs, use Netlify or Vercel instead.

---

## Public Portfolio URLs

Each user has a **slug** (URL-safe username) stored in their profile row. Public portfolios are accessible at:

```
https://your-site.com/u/<slug>
```

**How routing works:**

1. The Netlify `_redirects` / Vercel `vercel.json` rewrite rule maps `/u/john-doe` → `/public-portfolio.html?u=john-doe` with an HTTP 200 (no redirect in the browser URL bar — the clean URL is preserved).
2. `public-portfolio.html` loads, `public-portfolio.js` reads `?u=john-doe` from `window.location.search`.
3. The script queries Supabase for the profile with `slug = 'john-doe'`, fetches all portfolio data, and renders the appropriate template.

**Netlify `_redirects`:**
```
/u/:slug  /public-portfolio.html?u=:slug  200
```

**Vercel `vercel.json`:**
```json
{
  "rewrites": [
    { "source": "/u/:slug", "destination": "/public-portfolio.html?u=:slug" }
  ]
}
```

---

## Supabase RLS Security Model

Every table in PortfolioHub has **Row-Level Security (RLS) enabled** with the following principles:

| Operation | Rule |
|-----------|------|
| `SELECT` on public data | Allowed for everyone (anon + authenticated) |
| `SELECT` on private data | Allowed only for the owning user (`auth.uid() = user_id`) |
| `INSERT` | Allowed only for authenticated users, and only for rows they own |
| `UPDATE` | Allowed only for the row owner |
| `DELETE` | Allowed only for the row owner |

**Storage policies** mirror this: all 4 buckets are publicly readable (so portfolio images load without auth), but writes (upload, update, delete) are restricted to the authenticated user who owns the folder (`auth.uid()::text = storage.foldername(name)[1]`).

The full policy SQL is in [`supabase/migrations/schema.sql`](supabase/migrations/schema.sql) and [`supabase/migrations/storage-policies.sql`](supabase/migrations/storage-policies.sql).

---

## Environment Variables / Config Values

All configuration lives in [`js/config.js`](js/config.js):

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Your Supabase project URL | `https://abcdefgh.supabase.co` |
| `SUPABASE_ANON_KEY` | Your Supabase anon/public key | `eyJhbGciOiJIUzI1NiIsInR5...` |

There are no other environment variables — this is a purely client-side application.

> 💡 If you later add server-side rendering, CI/CD pipelines, or Netlify Edge Functions, store secrets as platform environment variables (Netlify → Site settings → Environment variables, or Vercel → Project settings → Environment variables) and inject them at build time.

---

## Known Limitations

### 1. Social Media Preview / Open Graph Tags

When a user shares a portfolio link (e.g. `https://your-site.com/u/john-doe`) on Twitter/X, LinkedIn, or Slack, social media crawlers fetch the page to generate a link preview. Since PortfolioHub renders content client-side (JavaScript fetches data from Supabase after the page loads), crawlers only see the empty HTML shell — they cannot execute JavaScript.

**Consequence**: Social previews will show the generic PortfolioHub title and description rather than the individual user's name, photo, and bio.

**Solution path — Netlify Edge Functions:**
Create a `netlify/edge-functions/og-meta.js` file that intercepts requests to `/u/:slug`, server-side fetches the user's profile from Supabase using the service-role key, and injects `<meta property="og:*">` tags into the HTML response before sending it to the crawler.

**Solution path — Vercel Middleware:**
Create a `middleware.js` at the project root that intercepts `/u/:slug` requests, fetches profile data, and rewrites the HTML response with injected OG tags.

Both solutions require a secure server-side Supabase call using the **service-role key** (never expose this in client-side code).

### 2. File Serving — Must Use HTTP, Not `file://`

ES6 module imports (used by all JS files) and Supabase Auth redirect flows require an `http://` or `https://` origin. Opening `index.html` directly in a browser via `file://` will cause CORS errors and modules will not load. Always use one of the local server options listed in [Step 7](#7-run-locally).

### 3. Email Confirmation in Development

If email confirmation is enabled in Supabase Auth, users must click a confirmation link in their inbox before they can log in. During development this can be disruptive. Disable it under **Authentication → Settings → Email Auth** while developing, and re-enable it before launching to real users.

### 4. Free Tier Limits

Supabase's free Hobby plan includes:
- 500 MB database storage
- 1 GB file storage
- 2 GB bandwidth/month
- 50,000 monthly active users

These limits are generous for development and small projects. Review [Supabase pricing](https://supabase.com/pricing) before scaling.

---

## License

```
MIT License

Copyright (c) 2025 PortfolioHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

Built with ❤️ using HTML, CSS, Vanilla JavaScript, and [Supabase](https://supabase.com).

</div>
