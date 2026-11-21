# Manual Test Checklist

Legend: **[auto]** covered by offline jsdom tests (`cd tests && npm ci && npm test`) · **[sql]** covered by `supabase_security_verification.sql` · **[manual]** you must do it in a browser / two SQL sessions.

## A. Order of operations
1. Run `supabase_diagnostics.sql` D1–D11, keep the output. 2. Backup. 3. Run `supabase_security_remediation.sql` (one execution). 4. Deploy frontend. 5. Run `supabase_security_verification.sql` (expect "0 FAILED").

## B. Authentication
- [manual] Signup, login, logout. [manual] After signup a single profile exists with the chosen handle (`select * from profiles where user_handle=…`).
- [manual] With email confirmation ON, signup completes and the profile still has the handle (created by the trigger, not the browser).
- [sql/auto] Profile update of `full_name`/`bio` works.

## C. Profile security
- [sql] A changes full_name, bio ✔ · attempts `user_handle`, `role`, `id` ✘ · B cannot edit A's profile · authenticated cannot insert profiles.
- [manual] DevTools: `await supabase.from('profiles').update({user_handle:'x-hack'}).eq('id', me)` → error; same for `role`.

## D. Admin
- [sql] Non-admin and anon cannot call the RPC · admin can · audit row appears · duplicate / case-variant / invalid / too-short / reserved rejected.
- [manual] Confirm with the real function (D1) that the audit row contains old/new handle, actor and reason.

## E. Email links (every template)
- [auto] Reference, Developer, Creative, Freelancer: every `mailto:` is exactly `mailto:<address>`; empty/invalid email renders no link.
- [manual, REQUIRED] Real browsers (Chrome, Edge, Firefox, Safari iOS/Android): click the email in **each** template, in **builder preview** and in the **published page** → the mail client opens to the right address. Also: empty email → no broken link; contact-form "send" still opens Gmail/popup.
- [manual] If Chrome still blocks it, open DevTools console on the published page and send me the message.

## F. Signup handle
- [auto] Field visible/labelled/required · valid unique handle reaches Auth metadata · existing, uppercase, <3, >30, spaces, symbols, empty, reserved all rejected with clear text · one profile created.
- [manual] Type a taken handle then blur → "already taken" appears. Two browsers signing up with the same handle at the same moment → one gets a handle error, no substitute handle.
- [manual] Screen reader/keyboard: label announced, hint and error read, Tab order sensible, 375 px width.

## G. UI (not audited by me)
- [manual] Buttons, nav, forms, dialogs, dropdowns, empty/loading/error states at 375, 430, 768, 1366, 1440 px; console errors; failed network requests; keyboard focus; light/dark if supported; preview vs published parity.

## H. Portfolios and numbers
- [sql] Client-sent number ignored · sequential · delete → number not reused · cannot change `portfolio_number`/`user_id` · cannot create for another user · RLS blocks B.
- [manual, REQUIRED] **Concurrency:** open two SQL Editor tabs as postgres; in each run (with a real user id) `begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"<uid>","role":"authenticated"}',true); insert into portfolios (user_id,title,slug) values ('<uid>','c','conc-'||pg_backend_pid()); select pg_sleep(5); commit;` at the same moment → distinct numbers. Delete the test rows afterwards (counters stay raised, by design).
- [manual] Dashboard: create first portfolio (#0 for new users), second (#1), delete and create (no reuse). Existing user's existing URLs still open. `/u/<handle>/<n>` opens; `/u/<slug>` opens.

## I. Community
- [sql] Create / edit / delete own post · cannot edit/delete B's · cannot post as B · cannot attach someone else's portfolio. [manual] UI create/edit/delete.

## J. Public access and views
- [sql/auto] Published readable by anon; unpublished invisible to anon, owner sees "not published" · anon and **logged-in** visitors increment views · direct `view_count` writes ignored/blocked.

## K. Permissions
- [sql] No TRUNCATE/TRIGGER/REFERENCES (and MAINTAIN on PG17) for anon/authenticated on any project table · no access to admin/counter/audit tables · sensitive RPCs not callable by unauthorized roles · trigger functions not executable but triggers still fire (`on_auth_user_created`, `updated_at`).
- [manual] Supabase Dashboard → Security Advisor: re-run; note anything still flagged.

## L. Regression
- [manual] Dashboard create/duplicate/publish/delete, builder autosave + save, profile page save (avatar upload), explore filters, community feed.
