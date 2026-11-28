# Community removal, unique views, and Most Viewed sorting

Legend: ✅ verified (how) · ⚠️ partly verified · ❌ not verifiable here.

## Run order (Supabase SQL Editor), then deploy the frontend
1. `supabase_unique_views.sql`  (adds `portfolio_views`, `record_portfolio_view()`, fixes the view-count trigger, closes the old counter)
2. `supabase_explore_sorting.sql`  (adds `explore_portfolios()` + two indexes)
3. Deploy the new frontend.
4. `supabase_remove_community.sql` **stage 1 only** (reversible lock-down). Stage 3 (drop) is commented out and needs your approval.
If you also use the earlier files: `supabase_security_remediation.sql` was updated (no Community grants, old counter closed) and is idempotent with the above; `supabase_portfolio_numbering.sql` is unchanged. Old frontend + step 1 means the old page's view call is refused (it ignores the error) until you deploy.

---
## 1. Community: everything removed

**Deleted files:** `community.html`, `js/community.js`, `css/community.css`.

**Edited (Community parts only):**
| File | Change |
|---|---|
| `js/navigation.js` | Removed the Community link from the desktop **and** mobile menus |
| `index.html` | Removed the nav + footer links, the "Community Feed" feature card, the whole "Join Our Professional Community" preview section and its CSS |
| `dashboard.html`, `js/dashboard.js` | Removed the "Community Posts" stat card, the "Join Community" quick action, the `community_posts` count query; stat grid 4→3 columns so the row stays full |
| `css/responsive.css` | Removed the `.community-posts` selector |
| `profile.html`, `README.md` | Copy no longer mentions community posts; README documents the new migrations |
| `supabase/migrations/schema.sql`, `002_fixes_and_templates.sql` | A **fresh install** no longer creates `community_posts`, its FK/indexes/trigger/policies, or the `community-images` bucket and policies |

**Kept on purpose:** `'community'` stays in the reserved-handle list (`js/handle.js` and the SQL). It only stops someone registering that name; it is not a feature.
**Not visible to you before:** the sidebar never had a Community entry; the landing page's feature grid now has 5 cards (3 columns, last row has two). I did not add content to fill the slot (no redesign).

**Database objects that still exist in YOUR database and need a decision** (`supabase_remove_community.sql`, nothing destructive runs as written):
| Object | Why it still exists | What I prepared |
|---|---|---|
| table `public.community_posts` (+ FK to profiles, 3 indexes, `updated_at` trigger, 4 RLS policies) | Dropping deletes the posts irreversibly | Stage 0 read-only preflight (data size, dependencies); **Stage 1** revokes all browser access (reversible, data kept); optional archive; **Stage 3** guarded DROP, commented out, refuses to run without `SET ph.confirm_drop_community = 'I-APPROVE-DROPPING-COMMUNITY'` |
| storage bucket `community-images` + 4 policies on `storage.objects` | Files must be removed through the Storage API (SQL deletes leave orphaned files) | Stage 3 drops the policies; the bucket itself is emptied/deleted in the Dashboard (instructions in the file) |
Dependencies found: the table points *at* profiles/users/portfolios; nothing points at it. Dropping it cannot change a profile, user or portfolio (proved on a clone: profile/portfolio/user counts and total views identical afterwards).

## 2. Unique views

**How it works.** One row per (portfolio, visitor) in private table `portfolio_views`, `PRIMARY KEY (portfolio_id, visitor_id)`. `record_portfolio_view(portfolio_id, visitor_id)` (SECURITY DEFINER) decides the identity on the server, runs `INSERT … ON CONFLICT DO NOTHING`, and only if a row was inserted runs `view_count = view_count + 1`. Duplicate requests, refreshes, reopened browsers and simultaneous requests therefore cannot add a second view.

**Identity.**
- *Signed in:* `u:<auth.uid()>`, taken from the JWT on the server. The id the browser sends is ignored (a client cannot impersonate or double-count).
- *Anonymous:* a random UUID v4 created in the browser (`js/view-tracker.js`), kept in `localStorage` and mirrored to a first-party cookie (`ph_vid`, `SameSite=Lax`, `Secure` on https, ~400 days). If either is cleared the other restores it. The server accepts it only if it is a well-formed UUID v4 and stores it as `a:<uuid>`. No IP, user-agent or fingerprinting is used.
- *Neither storage nor cookies available:* not counted (counting on every reload would be worse).

**Security.** `view_count` cannot be written by browsers (trigger + no direct grants); `portfolio_views` has RLS on, no policies, no privileges for `anon`/`authenticated`; only published portfolios count; the old `increment_view_count(slug)` is closed to browsers (kept, not dropped). The client also skips repeat requests (a "seen" marker), and one page makes at most one request per portfolio.

**Important fix included.** The previous `protect_portfolio_columns` trigger decided "is this a browser?" with `auth.uid()`, which is also set inside SECURITY DEFINER functions, so **signed-in visitors' views were silently reverted**. Proven: without the fix the row was recorded but `view_count` stayed 0. The migration replaces it with a `current_user` test.

**Existing data.** No `view_count`, portfolio, number or policy is changed (counts identical before/after; ✅ on PostgreSQL). ⚠️ Existing counts are *historical raw* page-load counts; only new views are unique, so rankings mix both until old counters age out. I did not reset or recompute them (you asked me not to; there is no data to reconstruct visitors).

**Limits (inherent to anonymous counting).** Clearing all site data, a private window, another browser or device = a new anonymous visitor. A deliberate attacker can mint random UUIDs to inflate a portfolio; that needs bot protection/rate limiting (e.g. Supabase/Cloudflare WAF), not a database rule. An anonymous visit followed by signing in on the same browser counts once (the browser marker); a signed-in person on a second device counts once (by user id); an anonymous visit on another device counts separately. The owner's own visit counts (not excluded; say if you want that).

## 3. Explore: Most / Least Viewed
**Root problem found.** Explore downloaded *all* published portfolios (capped at 500) and sorted/searched/paginated in the browser, so a popular portfolio outside the newest 500 would never appear under "Most Viewed". It now calls `explore_portfolios(search, role, sort, limit, offset)` and the database does the filtering, sorting and paging.
- Options: Newest, Oldest, **Most Viewed**, **Least Viewed** (+ the existing Name A–Z, kept). Same existing dropdown/styling; no new CSS.
- Sort uses `portfolios.view_count` (no second counter), so it reflects unique views.
- Ties: total deterministic order. Most viewed = views ↓, created ↓, id ↓; least viewed = the exact reverse; so pagination is stable and repeatable.
- Index: partial indexes on published rows (`view_count DESC, created_at DESC, id DESC` and `created_at DESC, id DESC`); `EXPLAIN` shows them used (also backwards for Least Viewed).
- Security: `SECURITY INVOKER` (RLS applies), always `is_published = true` (a signed-in owner's drafts are hidden too), ORDER BY from a fixed whitelist, search bound as a parameter with `% _ \` escaped, page size clamped to 1–50, returns only card fields (no email, no user id).
- UI robustness: stale responses ignored, "Load more" can't skip pages, duplicates guarded.

## 4. Database changes (all idempotent; none destructive)
`supabase_unique_views.sql`, `supabase_explore_sorting.sql`, `supabase_remove_community.sql` (stage 1 only), plus updated `supabase_security_remediation.sql` / `supabase_security_verification.sql` / `supabase_diagnostics.sql`.

## 5. Files modified
App: `index.html`, `dashboard.html`, `explore.html`, `profile.html`, `public-portfolio.html` (unchanged), `README.md`, `css/responsive.css`, `js/{navigation,dashboard,explore,public-portfolio,handle(none)}.js`, new `js/view-tracker.js`; migrations `supabase/migrations/{schema,002_fixes_and_templates}.sql`; deleted `community.html`, `js/community.js`, `css/community.css`.
Tests: `tests/{harness.mjs,mock-supabase.js,pages,public,security,urls}.test.mjs` updated; new `tests/{views,explore,community-removed}.test.mjs`.

## 6. Test results
| Suite | Result |
|---|---|
| Offline suites (jsdom), 15 files | **all pass**: incl. views 38, explore 33, community-removed 20 |
| Real PostgreSQL 16, `sql/views_test.sh` | **55/55** (run twice; also on a clone with Community fully dropped): first visit +1, refresh no, reopen no, other visitor +1, other portfolio +1, anon dedupe, forged/malformed ids rejected, unpublished not counted, **40 simultaneous identical requests → exactly one count (+1, one row), 40 different → +40**, direct `view_count` writes ignored/denied, `portfolio_views` unreadable/unwritable, old RPC closed, create/edit/publish/delete work, cascade removes views, numbers unchanged |
| Real PostgreSQL, `sql/explore_test.py` | **34/34**: sorts across all pages, ties, search+sort+pagination, role filter, injection attempts inert, 9999-view draft never shown (anon or its owner), wildcards literal, index used |
| Full verification file after all migrations | **212 checks, 0 failed** |
| Community migration | stage 1 reversible; stage 3 refuses without confirmation, drops cleanly, profiles/portfolios/users/view totals identical |
| Real Chromium | views **12/12** (cookie attributes, wipe-localStorage recovery, separate profile = new visitor, blocked storage not counted); explore/dashboard/landing **14/14** incl. 375/768/1366 widths |
⚠️ Not run against your real Supabase/PostgREST: the browser tests stub the Supabase module and the DB tests use a local replica of your audited schema (bodies I could not see — `handle_new_user`, `admin_change_user_handle` — are stand-ins).

## 7. Manual steps and findings
1. Run the SQL in the order above; deploy; run `supabase_security_verification.sql`. Review stage 3 of the Community migration when you are ready.
2. `supabase_diagnostics.sql` now also helps to confirm nothing else references `community_posts`.
3. Pre-existing, unrelated, not changed: `explore.html`, `profile.html` and `templates.html` load `js/navigation.js` (an ES module) with a plain `<script src>`; the browser logs one harmless "Cannot use import statement outside a module" error per page. Fix: `type="module"` on that tag.
4. The repo's SQL migrations still lack the live-only objects (handles, numbers, counters, admins), so `explore_portfolios` needs `portfolios.portfolio_number` and `profiles.user_handle` to exist (they do in your live DB).
