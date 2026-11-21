-- =====================================================================================
-- supabase_diagnostics.sql  -  READ-ONLY. Run each query on its own in the SQL Editor
-- (the editor shows only the last result). Nothing here changes data.
-- Run BEFORE supabase_security_remediation.sql and send me the results of D1-D5.
-- =====================================================================================

-- D1. Live definitions of the functions I did not rewrite (needed to review them safely)
SELECT p.proname, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('handle_new_user','admin_change_user_handle','allocate_portfolio_number','increment_view_count','protect_portfolio_columns','rls_auto_enable')
ORDER BY 1;

-- D2. Columns, types, defaults and nullability of the tables involved
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('profiles','portfolios','portfolio_counters','app_admins','user_handle_audit_log')
ORDER BY table_name, ordinal_position;

-- D3. Every trigger on the project tables and on auth.users (look for duplicates / unknown ones)
SELECT c.relname AS table_name, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND ((n.nspname = 'public') OR (n.nspname = 'auth' AND c.relname = 'users'))
ORDER BY 1, 2;

-- D4. Constraints and indexes on profiles and portfolios
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid IN ('public.profiles'::regclass, 'public.portfolios'::regclass, 'public.portfolio_counters'::regclass) ORDER BY 1, 2;

-- D5. All RLS policies in public
SELECT tablename, policyname, cmd, roles, qual AS using_expr, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2;

-- D6. Effective table grants today (who can do what) - note PUBLIC and grantors
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','service_role','PUBLIC')
GROUP BY 1, 2 ORDER BY 1, 2;

-- D7. Function privileges (acl) and owners, incl. the implicit PUBLIC grant (NULL acl = PUBLIC can execute)
SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer, p.proconfig, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' ORDER BY 1;

-- D8. Default privileges
SELECT pg_get_userbyid(defaclrole) AS for_role, defaclnamespace::regnamespace AS schema, defaclobjtype AS objtype, defaclacl FROM pg_default_acl ORDER BY 1, 2, 3;

-- D9. Data sanity before touching counters: every user's highest number vs their counter
SELECT p.user_handle, max(pf.portfolio_number) AS max_number, count(pf.id) AS portfolios, c.next_number AS counter
FROM public.profiles p LEFT JOIN public.portfolios pf ON pf.user_id = p.id LEFT JOIN public.portfolio_counters c ON c.user_id = p.id
GROUP BY p.user_handle, c.next_number ORDER BY 1;

-- D10. Which handles would the new reserved-name rule touch? (expect zero rows)
SELECT id, user_handle FROM public.profiles WHERE lower(user_handle) IN
 ('admin','administrator','api','app','assets','auth','community','css','dashboard','explore','help','index','js','login','logout','moderator','null',
  'portfolio','portfolio-builder','portfoliohub','profile','public-portfolio','register','reset-password','root','settings','signin','signup','staff',
  'support','system','templates','u','undefined','user','users','www');

-- D11. Does the live handle_new_user read role / full_name / user_handle from metadata? (search the D1 output for raw_user_meta_data)
