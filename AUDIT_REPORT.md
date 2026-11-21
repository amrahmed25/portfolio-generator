# PortfolioHub – Security Audit, Hardening & Fix Report

**Scope:** full repository (`portfolio generator.zip`, static HTML/JS + Supabase) against the live-DB audit findings you supplied.
**Status legend:** ✅ verified (how) · ⚠️ done but only partly verified · ❌ not done / not verifiable by me.

> **Important honesty note.** I could not access your Supabase project. The SQL was verified on a **local PostgreSQL 16 replica** I built from your audit (wide grants, the 13 tables, the 7 functions, the old trigger). Bodies I had never seen (`handle_new_user`, `admin_change_user_handle`, `rls_auto_enable`) are **stand-ins**. Nothing below is "fixed in production" until you run the SQL and the verification file there.

---
## 1. Repository inspection – what the code actually does

| Area | Finding |
|---|---|
| Stack | Static HTML + ES modules, Supabase JS client with the publishable (anon) key. No server routes, no Edge Functions. |
| Secrets | ✅ No `service_role` key anywhere in browser code, config or `.env.example`. |
| Admin | ✅ No admin UI, no `isAdmin`, no client-side role checks. `admin_change_user_handle` is **never called** by the app. |
| `allocate_portfolio_number` | ✅ **Never called.** Portfolio creation inserted **without** `portfolio_number`. |
| `user_handle` / `portfolio_number` | Not referenced anywhere in the original frontend. |
| `profiles.role` | A cosmetic professional label (signup dropdown; Explore filter). **Not** used for authorization. |
| Public URLs | The repo generates **`/u/{slug}`**, not `/u/{handle}/{number}` as your brief states. |
| Repo SQL vs live DB | The repo migrations have **none** of: `user_handle`, `portfolio_number`, `app_admins`, counters, audit table, the two RPCs, `profile_image_url`. They were added outside the repo. |

## 2. Confirmed vulnerabilities / defects

| # | Issue | Evidence | Code fix | DB fix needed |
|---|---|---|---|---|
| V1 | `anon`/`authenticated` hold TRUNCATE/TRIGGER/REFERENCES/MAINTAIN and full write on all tables (incl. admin, counter, audit). | Your audit; replica fails 100+ grant checks. | – | ✅ §1 |
| V2 | A user can rewrite their own **`user_handle`** and **`role`** (UPDATE policy has no column limits). | Reproduced on replica: `handle unchanged` check failed (`hijacked-handle`). | Profile saves no longer send protected columns | ✅ §5 |
| V3 | **Portfolio numbers can be reused**: a client may insert any `portfolio_number` (reproduced with 999; deleting #0 then inserting 0 would reuse it). | Replica | Client sends no number | ✅ §6 trigger |
| V4 | **Portfolio creation never allocated a number** → fails against NOT NULL `portfolio_number` (unless the live column has a default — unverified). | Replica; code trace | `createPortfolio` unchanged by design; server assigns | ✅ §6 |
| V5 | `protect_portfolio_columns` uses `auth.uid()`, which is non-null *inside* the SECURITY DEFINER `increment_view_count` → **logged-in visitors' views are silently reverted**. | Replica: expected 2, got 1. (Source: repo's `002_*.sql`; live body not seen.) | – | ✅ §6 (uses `current_user`) |
| V6 | Every function (incl. trigger fns, `rls_auto_enable`, admin fn) is callable as a public RPC; PUBLIC holds EXECUTE. | Audit; replica | – | ✅ §2 |
| V7 | Default privileges re-grant everything on future tables. | Audit; replica (22 ACL entries) | – | ✅ §3/§4 |
| V8 | Signup profile `upsert` sent a non-existent `email` column (always failed silently) and a client-chosen `role`; builder/profile `upsert` can't work with NOT NULL `user_handle`. | Code trace | ✅ removed / replaced by `update` | ✅ §1 revokes INSERT |
| V9 | Signup metadata `role` is client-controlled (could be `"admin"` if anything ever trusted it). | Replica: `role=admin` → stored as NULL after fix | – | ✅ §5 whitelist |
| V10 | Public page `<base>` regex only matched one path segment → CSS/JS would break on `/u/handle/0`. | Regex test | ✅ fixed | – |

## 3. UI, Signup & Template Fixes

| Issue | Component | Files | Fix | Tested | Limitations |
|---|---|---|---|---|---|
| **Email links not opening mail app** | All 4 templates, builder preview, public page | `js/templates/{helpers,parts,shared,reference,developer,creative,freelancer}.js`, `js/portfolio-renderer.js`, `js/public-portfolio.js`, `js/portfolio-builder.js` | Probable root cause: `mailto:` is a custom-protocol navigation from a **sandboxed iframe** that lacked `allow-top-navigation-to-custom-protocols`. Added the token (no `allow-same-origin` added). Also centralised `mailtoHref()`/`EMAIL_PATTERN`: invalid, empty or attribute-breaking addresses render **no link** instead of a malformed one. | ✅ jsdom: every `mailto:` in all 4 templates is exactly `mailto:<addr>`; empty/invalid/`x"onmouseover=…` render none (48 checks). ❌ **Not verified in a real browser/mail client** – the sandbox cause is my best-supported hypothesis. | Verify manually (checklist §E). Browsers without that sandbox token support behave as before. |
| **No User Handle at signup** | `signup.html`, `js/auth.js`, `js/handle.js` | + `css/auth.css` | Required field, explanation of permanence, format/length/reserved validation (no silent rewriting: uppercase is rejected), availability check, `user_handle` sent in Auth metadata, friendly errors for duplicates/trigger failures, no auto-substituted handle. Client-side upsert removed (profile is created by the trigger). | ✅ jsdom: field visible/labelled/required; valid handle reaches metadata; existing, uppercase, short, long, space, symbol, empty, reserved all rejected with no `signUp` call; exactly one profile created. ✅ DB trigger behaviour on replica. ⚠️ the "taken a moment ago" race path is covered by logic review only. | The real `handle_new_user` body is unseen: confirm it copies `user_handle` (and `role`) from metadata (diagnostic D1). Supabase reports trigger failures only as "Database error saving new user"; the UI re-checks availability to explain. |
| **Handle/number public URLs** | `js/public-portfolio.js`, `public-portfolio.html`, `vercel.json`, `_redirects` | | `/u/{handle}/{n}` and `?u=&n=` now resolve; existing `/u/{slug}` unchanged; `<base>` fixed. Unpublished stays invisible to visitors. | ✅ jsdom (8 checks) | **Link generation in the dashboard/builder is still slug-based** – needs your decision on the canonical URL. |
| **Full UI/UX audit at 375/430/768/1366/1440 px** | – | – | ❌ **Not performed.** No browser was available; I will not claim visual/responsive/accessibility fixes I could not observe. Only the new field was built with label, `aria-describedby`, `aria-live` error, and existing styles. | – | Needs a real browser pass (checklist §G). |

## 4. Code files modified
`signup.html`, `css/auth.css`, `js/auth.js`, `js/handle.js` (new), `js/profile.js`, `js/portfolio-builder.js`, `js/public-portfolio.js`, `public-portfolio.html`, `js/portfolio-renderer.js`, `js/templates/{helpers,parts,shared,reference,developer,creative,freelancer}.js`, `vercel.json`, `_redirects`; tests: `tests/{harness.mjs,mock-supabase.js,package.json}`, `tests/security.test.mjs` (new). Full diff: `changes.patch`.

**Test status:** all 7 offline suites pass (126+38+14+13+28+7+80). Note the pre-existing builder suite was **failing before my changes** because the mock schema lacked `profile_image_url`; I updated the mock to the live schema. These suites prove client behaviour against a mock only.

## 5. Database remediation (`supabase_security_remediation.sql`)
One transaction, idempotent (applied twice on the replica; second run was a no-op), project-owned objects in `public` only.

1. **Grants** – revoke all from PUBLIC/anon/authenticated on 13 tables; re-grant: anon SELECT on public-read tables; authenticated CRUD on portfolios/children/posts, **SELECT+UPDATE only on profiles**; **nothing** on `app_admins`, `portfolio_counters`, `user_handle_audit_log`.
2. **Functions** – revoke PUBLIC/anon/authenticated everywhere; grant `admin_change_user_handle` + `allocate_portfolio_number` to authenticated only; `increment_view_count` to anon+authenticated; trigger/internal functions to nobody; pin `search_path = public, pg_temp` on all SECURITY DEFINER functions.
3. **Default privileges** – postgres/public no longer auto-grants to anon/authenticated. 4. **supabase_admin** – guarded best effort (skips with a NOTICE where not permitted).
5. **Profiles** – trigger blocks client changes to `id`, `user_handle`, `role`; reserved handles rejected for everyone (incl. the admin RPC); signup `role` whitelisted.
6. **Portfolios** – trigger blocks `user_id`/`portfolio_number` changes; view-count bug fixed; counters floored (raise-only); **server-side allocation trigger** (client value ignored).
7. **Admin RPC** – *not rewritten* (see §7). 8. Admin/counter/audit tables – no client path remains. 9. Community policies unchanged and verified.

**Replica results:** before = 146 of 211 checks failed (exploits reproduced); after = **0 of 216 failed**. Existing numbers unchanged; a stale counter was raised, never lowered; 30 parallel inserts → 30 distinct sequential numbers; signup trigger still works after the EXECUTE revokes; the verification run leaves no residue.

## 6. Issues needing DB changes
V1–V7, V9 and the `portfolio_number` NOT NULL dependency (V4). Deploy order: **run the SQL, then deploy the frontend immediately.** Old frontend + new SQL breaks profile saves; new frontend + old SQL breaks portfolio creation (if no column default).

## 7. Remaining risks / open questions
1. **`admin_change_user_handle` and `handle_new_user` not reviewed** (bodies and audit-table columns unseen; I will not invent columns). Run diagnostics D1–D5 and send results.
2. **Replica ≠ production.** Re-run `supabase_security_verification.sql` on Supabase; expect 0 FAIL. It needs ≥2 non-admin profiles.
3. **Canonical public URL** (slug vs handle/number) – your decision; slugs are user-editable.
4. **View-count inflation**: anyone can call `increment_view_count` repeatedly; needs rate limiting/bot protection (not a DB-privilege issue).
5. **Storage bucket policies** (avatars/covers) and `auth` settings were **not audited**.
6. `profiles` is world-readable by design (includes `role`, `username`).
7. `allocate_portfolio_number` is now unused by the app; consider revoking its authenticated EXECUTE too.
8. Email fix and the entire UI/UX audit still need a real-browser pass.
9. Signup role: if the live `handle_new_user` ignores `role` metadata, the signup role choice is not persisted (it also wasn't before — the old client upsert always failed).
