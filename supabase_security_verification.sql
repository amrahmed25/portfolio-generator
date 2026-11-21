-- =====================================================================================
-- supabase_security_verification.sql
-- Run in the Supabase Dashboard SQL Editor AFTER supabase_security_remediation.sql
-- (you can also run it BEFORE, to see which checks currently FAIL).
--
-- SAFE: the data-changing checks run inside ONE DO block that ends by raising an exception.
-- That exception is how the report is delivered AND it rolls everything back, so no data
-- changes persist (counters, portfolios, posts, handle changes, audit rows).
-- It uses two EXISTING non-admin profiles as test users (A and B); B is temporarily made an
-- admin inside the transaction only. It needs at least two non-admin profiles.
-- It impersonates roles with SET ROLE + JWT claims, which is allowed for the postgres role
-- used by the SQL Editor.
--
-- RESULT: the run ENDS WITH AN ERROR on purpose. Read its message: the first line says
-- "VERIFICATION: n checks, f FAILED", followed by every FAILED check and then the passes.
-- You want f = 0. Run the whole file in a single execution (one session). Not covered here (do manually, see the test
-- checklist): concurrent allocation from two sessions, the signup trigger, and the UI.
-- =====================================================================================

CREATE TEMP TABLE chk (part text, name text, expected text, actual text, pass boolean);

-- Runs `sql` as the given role/user, returns 'ok rows=N' or 'blocked: <error>'.
CREATE FUNCTION pg_temp.try(sql text, uid uuid, rolename text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n bigint; res text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN uid IS NULL THEN json_build_object('role', rolename)::text
         ELSE json_build_object('sub', uid, 'role', rolename)::text END, true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  EXECUTE format('SET LOCAL ROLE %I', rolename);
  BEGIN
    EXECUTE sql; GET DIAGNOSTICS n = ROW_COUNT; res := 'ok rows=' || n;
  EXCEPTION WHEN OTHERS THEN res := 'blocked: ' || SQLERRM;
  END;
  RESET ROLE;
  RETURN res;
END $f$;

CREATE FUNCTION pg_temp.t(part text, name text, expect text, sql text, uid uuid, rolename text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r text := pg_temp.try(sql, uid, rolename);
BEGIN
  INSERT INTO chk VALUES (part, name, expect, r, left(r, length(expect)) = expect);
  RETURN r;
END $f$;

CREATE FUNCTION pg_temp.rec(part text, name text, expect text, actual text) RETURNS void LANGUAGE sql AS
$f$ INSERT INTO chk VALUES (part, name, expect, actual, expect = actual) $f$;

-- ---------------------------------------------------------------- PART 1: table grants
DO $$
DECLARE tbl text; priv text; rl text;
BEGIN
  FOREACH rl IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH tbl IN ARRAY ARRAY['profiles','portfolios','portfolio_projects','portfolio_services','portfolio_skills',
      'portfolio_experience','portfolio_education','portfolio_certifications','portfolio_links','community_posts',
      'portfolio_counters','app_admins','user_handle_audit_log'] LOOP
      -- dangerous privileges must never exist (MAINTAIN only exists on PostgreSQL 17+)
      FOREACH priv IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
        PERFORM pg_temp.rec('1 grants', rl||' no '||priv||' on '||tbl, 'false', has_table_privilege(rl, 'public.'||tbl, priv)::text);
      END LOOP;
      IF current_setting('server_version_num')::int >= 170000 THEN
        PERFORM pg_temp.rec('1 grants', rl||' no MAINTAIN on '||tbl, 'false', has_table_privilege(rl, 'public.'||tbl, 'MAINTAIN')::text);
      END IF;
    END LOOP;
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['portfolio_counters','app_admins','user_handle_audit_log'] LOOP
    FOREACH rl IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
        PERFORM pg_temp.rec('1 grants', rl||' no '||priv||' on '||tbl, 'false', has_table_privilege(rl, 'public.'||tbl, priv)::text);
      END LOOP;
    END LOOP;
  END LOOP;
  FOREACH tbl IN ARRAY ARRAY['profiles','portfolios','portfolio_projects','portfolio_services','portfolio_skills',
      'portfolio_experience','portfolio_education','portfolio_certifications','portfolio_links','community_posts'] LOOP
    PERFORM pg_temp.rec('1 grants', 'anon cannot write '||tbl, 'false',
      (has_table_privilege('anon','public.'||tbl,'INSERT') OR has_table_privilege('anon','public.'||tbl,'UPDATE') OR has_table_privilege('anon','public.'||tbl,'DELETE'))::text);
    PERFORM pg_temp.rec('1 grants', 'anon and authenticated can read '||tbl, 'true',
      (has_table_privilege('anon','public.'||tbl,'SELECT') AND has_table_privilege('authenticated','public.'||tbl,'SELECT'))::text);
  END LOOP;
  PERFORM pg_temp.rec('1 grants', 'authenticated cannot INSERT/DELETE profiles', 'false',
    (has_table_privilege('authenticated','public.profiles','INSERT') OR has_table_privilege('authenticated','public.profiles','DELETE'))::text);
  PERFORM pg_temp.rec('1 grants', 'authenticated can UPDATE profiles', 'true', has_table_privilege('authenticated','public.profiles','UPDATE')::text);
  PERFORM pg_temp.rec('1 grants', 'authenticated has full CRUD on portfolios', 'true',
    (has_table_privilege('authenticated','public.portfolios','INSERT') AND has_table_privilege('authenticated','public.portfolios','UPDATE') AND has_table_privilege('authenticated','public.portfolios','DELETE'))::text);
END $$;

-- ---------------------------------------------------------------- PART 2: function grants
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.admin_change_user_handle(uuid,text,text)','public.allocate_portfolio_number(uuid)','public.handle_new_user()',
    'public.protect_portfolio_columns()','public.rls_auto_enable()','public.update_updated_at()','public.protect_profile_columns()',
    'public.enforce_profile_policy()','public.assign_portfolio_number()'] LOOP
    IF to_regprocedure(f) IS NULL THEN PERFORM pg_temp.rec('2 functions', f||' exists', 'true', 'false'); CONTINUE; END IF;
    PERFORM pg_temp.rec('2 functions', 'anon cannot execute '||f, 'false', has_function_privilege('anon', f, 'EXECUTE')::text);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.handle_new_user()','public.protect_portfolio_columns()','public.rls_auto_enable()','public.update_updated_at()',
    'public.protect_profile_columns()','public.enforce_profile_policy()','public.assign_portfolio_number()'] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      PERFORM pg_temp.rec('2 functions', 'authenticated cannot call trigger/internal fn '||f, 'false', has_function_privilege('authenticated', f, 'EXECUTE')::text);
    END IF;
  END LOOP;
  PERFORM pg_temp.rec('2 functions', 'authenticated can call admin_change_user_handle', 'true', has_function_privilege('authenticated','public.admin_change_user_handle(uuid,text,text)','EXECUTE')::text);
  PERFORM pg_temp.rec('2 functions', 'authenticated can call allocate_portfolio_number', 'true', has_function_privilege('authenticated','public.allocate_portfolio_number(uuid)','EXECUTE')::text);
  PERFORM pg_temp.rec('2 functions', 'anon can call increment_view_count', 'true', has_function_privilege('anon','public.increment_view_count(text)','EXECUTE')::text);
  PERFORM pg_temp.rec('2 functions', 'authenticated can call increment_view_count', 'true', has_function_privilege('authenticated','public.increment_view_count(text)','EXECUTE')::text);
  -- PUBLIC pseudo-role: acl entries with grantee 0
  PERFORM pg_temp.rec('2 functions', 'no function in public is executable by PUBLIC (except none)', '0',
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('admin_change_user_handle','allocate_portfolio_number','handle_new_user','increment_view_count',
        'protect_portfolio_columns','rls_auto_enable','update_updated_at','protect_profile_columns','enforce_profile_policy','assign_portfolio_number')
        AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type='EXECUTE')))::text);
  PERFORM pg_temp.rec('2 functions', 'SECURITY DEFINER functions have a pinned search_path', '0',
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%'))::text);
END $$;

-- ---------------------------------------------------------------- PART 3: default privileges
SELECT pg_temp.rec('3 defaults', 'postgres defaults in public grant nothing to anon/authenticated', '0',
  (SELECT count(*) FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole JOIN pg_namespace n ON n.oid=d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a JOIN pg_roles g ON g.oid=a.grantee
    WHERE r.rolname='postgres' AND n.nspname='public' AND g.rolname IN ('anon','authenticated'))::text);

-- ---------------------------------------------------------------- PART 4: triggers present exactly once
SELECT pg_temp.rec('4 triggers', 'exactly one enabled trigger uses protect_portfolio_columns', '1',
  (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.portfolios'::regclass AND NOT tgisinternal AND tgenabled <> 'D'
     AND tgfoid='public.protect_portfolio_columns()'::regprocedure)::text);
SELECT pg_temp.rec('4 triggers', 'assign_portfolio_number trigger enabled', '1',
  (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.portfolios'::regclass AND NOT tgisinternal AND tgenabled <> 'D' AND tgfoid='public.assign_portfolio_number()'::regprocedure)::text);
SELECT pg_temp.rec('4 triggers', 'profile guard + policy triggers enabled', '2',
  (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal AND tgenabled <> 'D'
     AND tgfoid IN ('public.protect_profile_columns()'::regprocedure, 'public.enforce_profile_policy()'::regprocedure))::text);
SELECT pg_temp.rec('4 triggers', 'on_auth_user_created -> handle_new_user still enabled', '1',
  (SELECT count(*) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created' AND tgenabled <> 'D')::text);
SELECT pg_temp.rec('4 triggers', 'RLS still enabled on all 13 tables', '13',
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
     AND c.relname IN ('profiles','portfolios','portfolio_projects','portfolio_services','portfolio_skills','portfolio_experience','portfolio_education',
       'portfolio_certifications','portfolio_links','community_posts','portfolio_counters','app_admins','user_handle_audit_log'))::text);

-- ---------------------------------------------------------------- PARTS 5-9: behaviour (rolled back)
DO $$
DECLARE
  a uuid; b uuid; a_handle text; a_name text; a_bio text; pid uuid; pid2 uuid; bpid uuid; apid_pub uuid;
  n0 int; n1 int; n2 int; n_after int; cnt0 int; vc0 int; vc1 int; r text; post_b uuid; tot int; failed int; rep text;
BEGIN
  SELECT p.id INTO a FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM public.app_admins x WHERE x.user_id=p.id) ORDER BY p.created_at, p.id LIMIT 1;
  SELECT p.id INTO b FROM public.profiles p WHERE p.id <> a AND NOT EXISTS (SELECT 1 FROM public.app_admins x WHERE x.user_id=p.id) ORDER BY p.created_at, p.id LIMIT 1;
  IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'Need at least two non-admin profiles to run the behaviour tests'; END IF;
  INSERT INTO public.app_admins (user_id) VALUES (b) ON CONFLICT DO NOTHING;   -- B is the admin for this transaction only
  SELECT user_handle, full_name, bio INTO a_handle, a_name, a_bio FROM public.profiles WHERE id = a;

  -- ===== PART 5: profiles
  PERFORM pg_temp.t('5 profiles','A can edit full_name and bio','ok rows=1', format($q$UPDATE public.profiles SET full_name='Test Name', bio='Test bio' WHERE id=%L$q$, a), a, 'authenticated');
  PERFORM pg_temp.rec('5 profiles','full_name actually changed','Test Name',(SELECT full_name FROM public.profiles WHERE id=a));
  PERFORM pg_temp.t('5 profiles','A cannot change own user_handle','blocked', format($q$UPDATE public.profiles SET user_handle='hijacked-handle' WHERE id=%L$q$, a), a, 'authenticated');
  PERFORM pg_temp.t('5 profiles','A cannot change own role','blocked', format($q$UPDATE public.profiles SET role='admin' WHERE id=%L$q$, a), a, 'authenticated');
  PERFORM pg_temp.t('5 profiles','A cannot change own id','blocked', format($q$UPDATE public.profiles SET id=gen_random_uuid() WHERE id=%L$q$, a), a, 'authenticated');
  PERFORM pg_temp.rec('5 profiles','handle unchanged after attacks',a_handle,(SELECT user_handle FROM public.profiles WHERE id=a));
  PERFORM pg_temp.t('5 profiles','B cannot edit A''s profile (RLS)','ok rows=0', format($q$UPDATE public.profiles SET full_name='pwned' WHERE id=%L$q$, a), b, 'authenticated');
  PERFORM pg_temp.t('5 profiles','authenticated cannot insert a profile','blocked', format($q$INSERT INTO public.profiles (id,user_handle) VALUES (gen_random_uuid(),'zzz-new')$q$), a, 'authenticated');
  PERFORM pg_temp.t('5 profiles','anon cannot update profiles','blocked', format($q$UPDATE public.profiles SET full_name='x' WHERE id=%L$q$, a), NULL, 'anon');
  PERFORM pg_temp.t('5 profiles','anon can read profiles','ok', 'SELECT id FROM public.profiles LIMIT 1', NULL, 'anon');

  -- ===== PART 6: portfolios and numbering
  SELECT coalesce((SELECT next_number FROM public.portfolio_counters WHERE user_id=a), 0) INTO n0;
  PERFORM pg_temp.t('6 portfolios','A creates portfolio; client-sent number 999 is ignored','ok rows=1',
    format($q$INSERT INTO public.portfolios (user_id,title,slug,is_published,portfolio_number) VALUES (%L,'T1','zz-verif-1-'||%L,true,999)$q$, a, a), a, 'authenticated');
  SELECT id, portfolio_number INTO pid, n1 FROM public.portfolios WHERE slug='zz-verif-1-'||a;
  PERFORM pg_temp.rec('6 portfolios','server assigned the counter value (not 999)', n0::text, n1::text);
  PERFORM pg_temp.t('6 portfolios','A creates a second portfolio','ok rows=1', format($q$INSERT INTO public.portfolios (user_id,title,slug) VALUES (%L,'T2','zz-verif-2-'||%L)$q$, a, a), a, 'authenticated');
  SELECT id, portfolio_number INTO pid2, n2 FROM public.portfolios WHERE slug='zz-verif-2-'||a;
  PERFORM pg_temp.rec('6 portfolios','second number is previous + 1', (n1+1)::text, n2::text);
  PERFORM pg_temp.t('6 portfolios','A deletes portfolio #2','ok rows=1', format($q$DELETE FROM public.portfolios WHERE id=%L$q$, pid2), a, 'authenticated');
  PERFORM pg_temp.t('6 portfolios','A creates another after deleting','ok rows=1', format($q$INSERT INTO public.portfolios (user_id,title,slug) VALUES (%L,'T3','zz-verif-3-'||%L)$q$, a, a), a, 'authenticated');
  SELECT portfolio_number INTO n_after FROM public.portfolios WHERE slug='zz-verif-3-'||a;
  PERFORM pg_temp.rec('6 portfolios','deleted number is not reused', (n2+1)::text, n_after::text);
  PERFORM pg_temp.t('6 portfolios','A cannot change portfolio_number','blocked', format($q$UPDATE public.portfolios SET portfolio_number=0 WHERE id=%L$q$, pid), a, 'authenticated');
  PERFORM pg_temp.t('6 portfolios','A cannot change user_id','blocked', format($q$UPDATE public.portfolios SET user_id=%L WHERE id=%L$q$, b, pid), a, 'authenticated');
  PERFORM pg_temp.t('6 portfolios','A can edit own title/headline','ok rows=1', format($q$UPDATE public.portfolios SET title='Renamed', headline='h' WHERE id=%L$q$, pid), a, 'authenticated');
  PERFORM pg_temp.t('6 portfolios','A cannot create a portfolio owned by B','blocked', format($q$INSERT INTO public.portfolios (user_id,title,slug) VALUES (%L,'evil','zz-verif-evil-'||%L)$q$, b, a), a, 'authenticated');
  PERFORM pg_temp.t('6 portfolios','B cannot update A''s portfolio (RLS)','ok rows=0', format($q$UPDATE public.portfolios SET title='pwned' WHERE id=%L$q$, pid), b, 'authenticated');
  PERFORM pg_temp.t('6 portfolios','B cannot delete A''s portfolio (RLS)','ok rows=0', format($q$DELETE FROM public.portfolios WHERE id=%L$q$, pid), b, 'authenticated');
  PERFORM pg_temp.rec('6 portfolios','counter is never behind max(number)+1', 'true',
    ((SELECT next_number FROM public.portfolio_counters WHERE user_id=a) >= (SELECT max(portfolio_number)+1 FROM public.portfolios WHERE user_id=a))::text);
  PERFORM pg_temp.t('6 portfolios','authenticated cannot read counters directly','blocked','SELECT * FROM public.portfolio_counters', a, 'authenticated');
  PERFORM pg_temp.t('6 portfolios','authenticated cannot reset own counter','blocked', format($q$UPDATE public.portfolio_counters SET next_number=0 WHERE user_id=%L$q$, a), a, 'authenticated');
  PERFORM pg_temp.t('6 portfolios','authenticated cannot delete own counter','blocked', format($q$DELETE FROM public.portfolio_counters WHERE user_id=%L$q$, a), a, 'authenticated');
  PERFORM pg_temp.t('6 portfolios','anon cannot call allocate_portfolio_number','blocked', format($q$SELECT public.allocate_portfolio_number(%L)$q$, a), NULL, 'anon');
  PERFORM pg_temp.t('6 portfolios','B cannot allocate for A','blocked', format($q$SELECT public.allocate_portfolio_number(%L)$q$, a), b, 'authenticated');
  PERFORM pg_temp.t('6 portfolios','A can allocate for self (RPC still works)','ok', format($q$SELECT public.allocate_portfolio_number(%L)$q$, a), a, 'authenticated');

  -- views
  SELECT view_count INTO vc0 FROM public.portfolios WHERE id=pid;
  PERFORM pg_temp.t('6 views','anon increments a published portfolio','ok', format($q$SELECT public.increment_view_count(%L)$q$, 'zz-verif-1-'||a), NULL, 'anon');
  SELECT view_count INTO vc1 FROM public.portfolios WHERE id=pid;
  PERFORM pg_temp.rec('6 views','anon view counted', (vc0+1)::text, vc1::text);
  PERFORM pg_temp.t('6 views','LOGGED-IN visitor increments','ok', format($q$SELECT public.increment_view_count(%L)$q$, 'zz-verif-1-'||a), b, 'authenticated');
  SELECT view_count INTO vc0 FROM public.portfolios WHERE id=pid;
  PERFORM pg_temp.rec('6 views','logged-in view counted (was reverted by the old trigger)', (vc1+1)::text, vc0::text);
  PERFORM pg_temp.t('6 views','owner cannot set view_count directly','ok', format($q$UPDATE public.portfolios SET view_count=5000 WHERE id=%L$q$, pid), a, 'authenticated');
  PERFORM pg_temp.rec('6 views','direct view_count write ignored', vc0::text, (SELECT view_count::text FROM public.portfolios WHERE id=pid));
  PERFORM pg_temp.t('6 views','anon cannot update portfolios directly','blocked', format($q$UPDATE public.portfolios SET view_count=9999 WHERE id=%L$q$, pid), NULL, 'anon');
  PERFORM pg_temp.t('6 views','anon cannot read the unpublished state of others','ok rows=0', format($q$SELECT 1 FROM public.portfolios WHERE id=%L AND NOT is_published$q$, pid), NULL, 'anon');

  -- ===== PART 7: admin handle change
  PERFORM pg_temp.t('7 admin','non-admin A cannot call admin RPC','blocked', format($q$SELECT public.admin_change_user_handle(%L,'valid-new-handle','test')$q$, b), a, 'authenticated');
  PERFORM pg_temp.t('7 admin','anon cannot call admin RPC','blocked', format($q$SELECT public.admin_change_user_handle(%L,'valid-new-handle','test')$q$, a), NULL, 'anon');
  SELECT count(*) INTO cnt0 FROM public.user_handle_audit_log;
  PERFORM pg_temp.t('7 admin','admin changes A''s handle','ok', format($q$SELECT public.admin_change_user_handle(%L,'verif-new-handle','verification test')$q$, a), b, 'authenticated');
  PERFORM pg_temp.rec('7 admin','handle was changed','verif-new-handle',(SELECT user_handle FROM public.profiles WHERE id=a));
  PERFORM pg_temp.rec('7 admin','audit row written (+1)', (cnt0+1)::text, (SELECT count(*)::text FROM public.user_handle_audit_log));
  PERFORM pg_temp.t('7 admin','duplicate handle rejected','blocked', format($q$SELECT public.admin_change_user_handle(%L,(SELECT user_handle FROM public.profiles WHERE id=%L),'dup')$q$, a, b), b, 'authenticated');
  PERFORM pg_temp.t('7 admin','case-variant duplicate rejected','blocked', format($q$SELECT public.admin_change_user_handle(%L,upper((SELECT user_handle FROM public.profiles WHERE id=%L)),'dup')$q$, a, b), b, 'authenticated');
  PERFORM pg_temp.t('7 admin','invalid handle (spaces/uppercase) rejected','blocked', format($q$SELECT public.admin_change_user_handle(%L,'Bad Handle!','x')$q$, a), b, 'authenticated');
  PERFORM pg_temp.t('7 admin','too-short handle rejected','blocked', format($q$SELECT public.admin_change_user_handle(%L,'ab','x')$q$, a), b, 'authenticated');
  PERFORM pg_temp.t('7 admin','reserved handle rejected','blocked', format($q$SELECT public.admin_change_user_handle(%L,'admin','x')$q$, a), b, 'authenticated');
  PERFORM pg_temp.t('7 admin','authenticated cannot read app_admins','blocked','SELECT * FROM public.app_admins', a, 'authenticated');
  PERFORM pg_temp.t('7 admin','user cannot promote self in app_admins','blocked', format($q$INSERT INTO public.app_admins (user_id) VALUES (%L)$q$, a), a, 'authenticated');
  PERFORM pg_temp.t('7 admin','authenticated cannot read audit log','blocked','SELECT * FROM public.user_handle_audit_log', a, 'authenticated');
  PERFORM pg_temp.t('7 admin','authenticated cannot write audit log','blocked', format($q$INSERT INTO public.user_handle_audit_log (user_id) VALUES (%L)$q$, a), a, 'authenticated');
  PERFORM pg_temp.t('7 admin','anon cannot read audit log','blocked','SELECT * FROM public.user_handle_audit_log', NULL, 'anon');

  -- ===== PART 9: community
  INSERT INTO public.community_posts (user_id, content) VALUES (b, 'post by B') RETURNING id INTO post_b;
  SELECT id INTO bpid FROM public.portfolios WHERE user_id=b LIMIT 1;
  PERFORM pg_temp.t('9 community','A creates a post','ok rows=1', format($q$INSERT INTO public.community_posts (user_id,content) VALUES (%L,'hello')$q$, a), a, 'authenticated');
  PERFORM pg_temp.t('9 community','A creates a post attached to own portfolio','ok rows=1', format($q$INSERT INTO public.community_posts (user_id,content,portfolio_id) VALUES (%L,'mine',%L)$q$, a, pid), a, 'authenticated');
  PERFORM pg_temp.t('9 community','A cannot post as B','blocked', format($q$INSERT INTO public.community_posts (user_id,content) VALUES (%L,'fake')$q$, b), a, 'authenticated');
  PERFORM pg_temp.t('9 community','A cannot attach another user''s portfolio','blocked', format($q$INSERT INTO public.community_posts (user_id,content,portfolio_id) VALUES (%L,'x',%L)$q$, a, coalesce(bpid, gen_random_uuid())), a, 'authenticated');
  PERFORM pg_temp.t('9 community','A edits own post','ok rows=1', format($q$UPDATE public.community_posts SET content='edited' WHERE user_id=%L AND content='hello'$q$, a), a, 'authenticated');
  PERFORM pg_temp.t('9 community','A cannot edit B''s post (RLS)','ok rows=0', format($q$UPDATE public.community_posts SET content='pwned' WHERE id=%L$q$, post_b), a, 'authenticated');
  PERFORM pg_temp.t('9 community','A cannot delete B''s post (RLS)','ok rows=0', format($q$DELETE FROM public.community_posts WHERE id=%L$q$, post_b), a, 'authenticated');
  PERFORM pg_temp.t('9 community','A deletes own post','ok rows=1', format($q$DELETE FROM public.community_posts WHERE user_id=%L AND content='edited'$q$, a), a, 'authenticated');
  PERFORM pg_temp.t('9 community','anon can read posts','ok','SELECT id FROM public.community_posts LIMIT 1', NULL, 'anon');
  PERFORM pg_temp.t('9 community','anon cannot create posts','blocked', format($q$INSERT INTO public.community_posts (user_id,content) VALUES (%L,'x')$q$, a), NULL, 'anon');

  -- ===== report + rollback
  SELECT count(*), count(*) FILTER (WHERE NOT pass) INTO tot, failed FROM chk;
  SELECT string_agg(CASE WHEN pass THEN 'PASS ' ELSE 'FAIL ' END || part || ' | ' || name || ' | expected: ' || expected || ' | actual: ' || left(actual, 90),
                    E'\n' ORDER BY pass, part, name) INTO rep FROM chk;
  RAISE EXCEPTION E'VERIFICATION: % checks, % FAILED  (this error is intentional: it rolls back all test data)\n%', tot, failed, rep;
END $$;
