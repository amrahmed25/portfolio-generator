-- =====================================================================================
-- supabase_security_remediation.sql
-- PortfolioHub - database hardening. Run MANUALLY in the Supabase Dashboard SQL Editor.
--
-- BEFORE YOU RUN
--   1. Run supabase_security_verification.sql PART 0 (read-only diagnostics) and keep the output.
--   2. Take a backup / confirm point-in-time recovery is on.
--   3. Run this whole file in ONE execution (it is one transaction: any error applies nothing).
--   4. Deploy the matching frontend code immediately afterwards (see "DEPLOY ORDER" at the end).
--
-- DESIGN RULES
--   * Idempotent: safe to run twice. No data is deleted; counters are only ever RAISED.
--   * Only project-owned objects in schema public are touched. auth, storage, realtime,
--     extensions, graphql, graphql_public are NOT modified.
--   * No client-controlled flags. "Is this a direct client write?" is decided with
--     current_user (anon/authenticated). SECURITY DEFINER functions run as their owner, so
--     they pass the guards; a browser cannot become the owner.
--   * service_role is intentionally left alone (server-side only; it bypasses RLS anyway).
--
-- NOT CHANGED ON PURPOSE (because the live bodies / columns were not available when this
-- was written; rewriting them blind would invent columns):
--   * admin_change_user_handle()  -> hardened by sections 2 and 7 only (grants, search_path,
--     and DB-level guards that also apply to it). Send its definition + the audit-table
--     columns (PART 0) if you want it rewritten.
--   * handle_new_user()           -> hardened by sections 2 and 5 only.
-- =====================================================================================

BEGIN;

-- =====================================================================================
-- SECTION 1 - TABLE GRANTS (least privilege)
-- WHAT   : removes every privilege (incl. TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) that
--          anon/authenticated hold on the 13 project tables, then grants back only what
--          the app uses.
-- WHY    : RLS does not stop TRUNCATE, and anon had full write privileges.
-- DEPENDS: every page. Matrix below was derived from the code call sites:
--            anon          : SELECT on public-read tables (public portfolio, explore, community)
--            authenticated : SELECT everywhere public; INSERT/UPDATE/DELETE on portfolios,
--                            the 7 portfolio_* child tables and community_posts;
--                            profiles: SELECT + UPDATE only (rows are created by the signup
--                            trigger; nothing in the app inserts or deletes profiles)
--            nobody        : app_admins, portfolio_counters, user_handle_audit_log
--          (these three are reached only through SECURITY DEFINER functions)
-- VERIFY : PART 1 of the verification file.
-- =====================================================================================
REVOKE ALL ON TABLE
  public.profiles, public.portfolios, public.portfolio_projects, public.portfolio_services,
  public.portfolio_skills, public.portfolio_experience, public.portfolio_education,
  public.portfolio_certifications, public.portfolio_links, public.community_posts,
  public.portfolio_counters, public.app_admins, public.user_handle_audit_log
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.profiles, public.portfolios, public.portfolio_projects, public.portfolio_services,
  public.portfolio_skills, public.portfolio_experience, public.portfolio_education,
  public.portfolio_certifications, public.portfolio_links, public.community_posts
TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.portfolios, public.portfolio_projects, public.portfolio_services,
  public.portfolio_skills, public.portfolio_experience, public.portfolio_education,
  public.portfolio_certifications, public.portfolio_links, public.community_posts
TO authenticated;

GRANT UPDATE ON TABLE public.profiles TO authenticated;   -- guarded by section 5 triggers

-- Optional, not applied: tighten service_role too (it bypasses RLS; keep unless you are sure
-- no script/dashboard job needs these):
-- REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM service_role;

-- =====================================================================================
-- SECTION 2 - FUNCTION EXECUTE GRANTS + search_path
-- WHAT   : removes the implicit PUBLIC execute and the anon/authenticated grants, then
--          grants only the intended callers. Pins search_path on the SECURITY DEFINER
--          functions (pg_temp last so temp objects cannot shadow public ones).
-- WHY    : every function was callable as a public RPC (incl. trigger functions and the
--          admin function). Trigger functions do NOT need EXECUTE at fire time, so the
--          existing triggers keep working.
-- DEPENDS: increment_view_count -> public page (anon + authenticated visitors) - kept.
--          allocate_portfolio_number / admin_change_user_handle -> authenticated only; both
--          still do their own auth.uid() checks inside. (The app itself no longer needs
--          allocate_portfolio_number: section 6 allocates in a trigger. You may revoke its
--          authenticated EXECUTE as well once you are sure no other client uses it.)
-- VERIFY : PART 2.
-- =====================================================================================
ALTER FUNCTION public.admin_change_user_handle(uuid, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.allocate_portfolio_number(uuid)            SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()                          SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_view_count(text)                 SET search_path = public, pg_temp;
ALTER FUNCTION public.rls_auto_enable()                          SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.admin_change_user_handle(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.allocate_portfolio_number(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_view_count(text)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user()                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_portfolio_columns()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable()                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at()                        FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_change_user_handle(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_portfolio_number(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_view_count(text)                 TO anon, authenticated;

-- =====================================================================================
-- SECTION 3 - DEFAULT PRIVILEGES for objects postgres creates in public
-- WHAT   : future tables/sequences/functions created by postgres in public will no longer
--          be auto-granted to anon/authenticated.
-- WHY    : the audited defaults (arwdDxtm etc.) silently re-create the original problem
--          for every new table.
-- IMPACT : a NEW table needs explicit GRANTs (and RLS policies) before the app can use it.
--          service_role keeps its defaults.
-- NOTE   : functions also get EXECUTE for PUBLIC by default; that cannot be removed with
--          "IN SCHEMA". Revoke it per function (as done above) in every new migration:
--              REVOKE ALL ON FUNCTION public.new_fn(...) FROM PUBLIC;
--          (Global alternative, affects ALL schemas for postgres-created functions, so it is
--           left commented out:  ALTER DEFAULT PRIVILEGES FOR ROLE postgres
--                                REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC; )
-- VERIFY : PART 3.
-- =====================================================================================
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- =====================================================================================
-- SECTION 4 - DEFAULT PRIVILEGES for supabase_admin in public (best effort)
-- WHAT   : same as section 3 for objects supabase_admin creates in public.
-- NOTE   : on hosted Supabase the postgres role is usually NOT a member of supabase_admin,
--          so this is expected to print a NOTICE and skip. That is fine: it only matters
--          for objects Supabase itself creates in public, which is rare. Do not try to
--          work around the NOTICE (e.g. by granting yourself supabase_admin).
-- =====================================================================================
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
  RAISE NOTICE 'Section 4 skipped (not permitted / role absent): %', SQLERRM;
END $$;

-- =====================================================================================
-- SECTION 5 - PROFILE PROTECTION
-- WHAT   : (a) trg_protect_profile_columns: a direct client UPDATE can no longer change
--              id, user_handle or role.
--          (b) trg_enforce_profile_policy: on INSERT and on any user_handle change - by anyone,
--              including admin_change_user_handle - rejects reserved handles; on INSERT it
--              also drops a `role` that is not one of the signup dropdown values, because
--              signup metadata is client-controlled.
-- WHY    : profiles_update_own allows any column. Without this a user could change their
--          permanent handle or write role='admin'. (profiles.role is a cosmetic label in
--          this app, but it must never be trusted for authorization; app_admins is the
--          admin registry.)
-- DEPENDS: signup (handle + role arrive through handle_new_user), profile page and builder
--          (they update full_name, username, title, bio, location, website, avatar_url only).
-- KEEP IN SYNC: the reserved list = RESERVED_HANDLES in js/handle.js; the role list =
--          <select id="role"> in signup.html.
-- VERIFY : PART 5.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- SECURITY INVOKER on purpose: current_user is the caller's role. Inside a SECURITY DEFINER
  -- function (e.g. admin_change_user_handle) it is the function owner, which is allowed.
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'profile id cannot be changed' USING ERRCODE = '42501';
    END IF;
    IF NEW.user_handle IS DISTINCT FROM OLD.user_handle THEN
      RAISE EXCEPTION 'user_handle can only be changed by an administrator' USING ERRCODE = '42501';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'role cannot be changed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.enforce_profile_policy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  reserved text[] := ARRAY['admin','administrator','api','app','assets','auth','community','css','dashboard',
    'explore','help','index','js','login','logout','moderator','null','portfolio','portfolio-builder',
    'portfoliohub','profile','public-portfolio','register','reset-password','root','settings','signin',
    'signup','staff','support','system','templates','u','undefined','user','users','www'];
  allowed_roles text[] := ARRAY['Developer','Designer','Freelancer','Content Creator','Marketing','Business','Student','Other'];
BEGIN
  IF TG_OP = 'INSERT' OR NEW.user_handle IS DISTINCT FROM OLD.user_handle THEN
    IF lower(NEW.user_handle) = ANY (reserved) THEN
      RAISE EXCEPTION 'handle "%" is reserved', NEW.user_handle USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.role IS NOT NULL AND NOT (NEW.role = ANY (allowed_roles)) THEN
    NEW.role := NULL;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

DROP TRIGGER IF EXISTS trg_enforce_profile_policy ON public.profiles;
CREATE TRIGGER trg_enforce_profile_policy BEFORE INSERT OR UPDATE OF user_handle ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_policy();

REVOKE ALL ON FUNCTION public.protect_profile_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_profile_policy()  FROM PUBLIC, anon, authenticated;

-- =====================================================================================
-- SECTION 6 - PORTFOLIO PROTECTION AND NUMBER ALLOCATION
-- WHAT   : (a) protect_portfolio_columns is replaced: user_id can never change;
--              portfolio_number cannot be changed by a client; view_count is reverted
--              for client writes only. Any older trigger bound to this function under
--              another name is removed first so exactly one remains.
--          (b) one-time counter floor: counter = GREATEST(current, max(number)+1).
--              Counters are only raised, never reset or lowered.
--          (c) trg_assign_portfolio_number: BEFORE INSERT, the SERVER assigns
--              portfolio_number from portfolio_counters (atomic upsert, row-locked, so
--              concurrent inserts get distinct numbers; first number is 0). A value sent
--              by the client is ignored, so a deleted number can never be re-inserted.
--              If the insert fails the counter increment rolls back with it (no gaps from
--              failures; gaps from deletions are intentional and permanent).
-- WHY    : (a) the old trigger used auth.uid(), which is non-null INSIDE the SECURITY
--          DEFINER increment_view_count for logged-in visitors, so their view was silently
--          reverted; it also did not protect portfolio_number. (c) the browser never
--          allocated numbers, and a client-supplied number could reuse a deleted one.
-- DEPENDS: dashboard "create portfolio" (js/portfolio-service.js sends no number now),
--          builder save, public page /u/{handle}/{number}, view counter.
-- VERIFY : PART 6.
-- =====================================================================================
CREATE OR REPLACE FUNCTION public.protect_portfolio_columns()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'portfolio owner cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.portfolio_number IS DISTINCT FROM OLD.portfolio_number THEN
      RAISE EXCEPTION 'portfolio_number cannot be changed' USING ERRCODE = '42501';
    END IF;
    IF NEW.view_count IS DISTINCT FROM OLD.view_count THEN
      NEW.view_count := OLD.view_count;     -- silently ignored, as before
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tgname FROM pg_trigger
           WHERE tgrelid = 'public.portfolios'::regclass AND NOT tgisinternal
             AND tgfoid = 'public.protect_portfolio_columns()'::regprocedure
  LOOP
    EXECUTE format('DROP TRIGGER %I ON public.portfolios', t.tgname);
  END LOOP;
END $$;
CREATE TRIGGER trg_protect_portfolio_columns BEFORE UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.protect_portfolio_columns();

-- (b) counter floor (raise only)
INSERT INTO public.portfolio_counters AS c (user_id, next_number)
SELECT user_id, max(portfolio_number) + 1 FROM public.portfolios GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE SET next_number = GREATEST(c.next_number, EXCLUDED.next_number);

-- (c) server-side allocation
CREATE OR REPLACE FUNCTION public.assign_portfolio_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  -- Defence in depth: a signed-in caller can only allocate for themselves (RLS WITH CHECK
  -- also rejects the row afterwards, and the whole statement rolls back).
  IF auth.uid() IS NOT NULL AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.portfolio_counters AS c (user_id, next_number)
  VALUES (NEW.user_id, 1)
  ON CONFLICT (user_id) DO UPDATE SET next_number = c.next_number + 1
  RETURNING c.next_number - 1 INTO NEW.portfolio_number;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_assign_portfolio_number ON public.portfolios;
CREATE TRIGGER trg_assign_portfolio_number BEFORE INSERT ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.assign_portfolio_number();

REVOKE ALL ON FUNCTION public.assign_portfolio_number() FROM PUBLIC, anon, authenticated;

-- =====================================================================================
-- SECTION 7 - ADMIN HANDLE CHANGE
-- WHAT   : no function rewrite (see header). Effective protections after sections 1,2,5:
--            * only `authenticated` can call it (anon and PUBLIC cannot);
--            * its own app_admins check remains the authorization;
--            * users cannot bypass it with a direct UPDATE (section 5 trigger);
--            * duplicates incl. case-insensitive ones: unique index on lower(user_handle);
--            * reserved handles: rejected for admins as well (section 5 trigger);
--            * profile update + audit insert stay atomic (single function = single txn).
-- OPEN   : confirm from PART 0 that the live function (a) schema-qualifies its objects
--          (search_path is now public, pg_temp), (b) locks the profile row, (c) writes the
--          audit row in the same function. Send the definition for a rewrite if not.
-- =====================================================================================

-- =====================================================================================
-- SECTION 8 - app_admins / portfolio_counters / user_handle_audit_log
-- WHAT   : nothing extra. Section 1 revoked all client privileges on them and they have
--          RLS enabled with no policies, i.e. deny-by-default twice over. They are reached
--          only through SECURITY DEFINER code owned by postgres.
-- NOT DONE ON PURPOSE: FORCE ROW LEVEL SECURITY. The definer functions rely on the owner
--          bypassing RLS; forcing it could break them. Revisit only with a tested rewrite.
-- =====================================================================================

-- =====================================================================================
-- SECTION 9 - community_posts and other RLS
-- WHAT   : no policy changes. The existing ownership checks (user_id and portfolio_id
--          ownership on INSERT/UPDATE) are preserved and verified in PART 9.
--          profiles_insert_own is now unreachable (INSERT revoked); leaving it is harmless.
-- =====================================================================================

-- Make PostgREST pick up grant/function changes immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================================
-- DEPLOY ORDER
--   1. Run this file.  2. Deploy the new frontend straight away.
--   Old frontend + new SQL : profile saves break (their upsert needs INSERT on profiles).
--   New frontend + old SQL : creating a portfolio fails if portfolio_number has no default
--                            (and handle protections are not active).
-- ROLLBACK (emergency only - restores the insecure state): re-GRANT the privileges you
-- need and DROP TRIGGER trg_assign_portfolio_number / trg_protect_profile_columns /
-- trg_enforce_profile_policy ON the tables.
-- =====================================================================================
