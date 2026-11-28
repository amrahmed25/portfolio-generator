# Contact form: how email delivery works and what you must configure

## What was wrong
1. **The Send button did nothing in real browsers.** Portfolios render inside a sandboxed iframe whose `sandbox` attribute lacked `allow-forms`. Chrome then blocks the form submission *before* the `submit` event fires, so no handler ever ran. (Test tools such as jsdom do not implement this, so it never showed up in earlier tests.)
2. **Even when the handler could run, nothing was ever delivered.** It only opened a *Gmail Compose draft* in a new tab (needs a Gmail login, pop-ups allowed and a manual Send) and then reported "success" because a window opened. The project had no backend and no email provider.

## Architecture
```
visitor ─► portfolio (sandboxed iframe, js/templates/runtime.js)         validates, "Sending...", honeypot
              │  postMessage (only the 4 text fields)
              ▼
   public page (js/contact-relay.js)  ── accepts messages only from the portfolio iframe
              │  POST /api/contact  (same-origin; adds the portfolio id IT loaded; never a recipient)
              ▼
   Vercel function api/contact.js     origin check ► rate limit ► validate ► look up recipient ► Resend
              │                                       │ Supabase REST (anon key, published portfolios only)
              ▼
   Resend  ─►  owner's inbox   (From = your verified sender, Reply-To = the visitor)
```
* **Provider: Resend** (HTTPS API, no npm dependency). **Recipient** = `portfolios.contact_email` of the *published* portfolio that is open: the same address the portfolio already shows publicly. The browser can never choose it. If a portfolio has no contact email the form is not rendered (unchanged behaviour).
* The success message appears only after Resend accepts the message (HTTP 2xx **and** a message id). Everything else shows "Failed to send message. Please try again." and keeps the visitor's text.
* All four templates share one implementation (`runtime.js`); the three form markups were not changed. The builder preview shows the form but never sends (it says so).
* Gmail Compose is kept: it is offered as a "Write it in Gmail instead" link when delivery fails. `mailto:` links are unchanged.

## What YOU must configure (I cannot do this for you)
1. **Create a Resend account** and an **API key** (Resend → API Keys, "Sending access").
2. **Verify a sending domain** in Resend (Domains → Add; add the DNS records). Without a verified domain Resend only lets you send from `onboarding@resend.dev` **to your own account email**, so mail to other portfolio owners will be rejected (the form then shows the failure message).
3. In **Vercel → Project → Settings → Environment Variables** (Production and Preview) add:

| Variable | Value | Secret? |
|---|---|---|
| `RESEND_API_KEY` | the key from step 1 | **yes** (server only) |
| `CONTACT_FROM` | `PortfolioHub <contact@your-verified-domain.com>` | no |
| `SUPABASE_URL` | same URL as `js/config.js` | no |
| `SUPABASE_ANON_KEY` | the *publishable/anon* key from `js/config.js` | no (public by design) |
| `ALLOWED_ORIGINS` *(optional)* | extra trusted origins, comma separated | no |

4. **Redeploy** (environment variables only apply to new deployments). The `api/` folder needs no `package.json`.
5. Never commit the key. `.env.example` lists the names only.

If a variable is missing the endpoint answers `503 not_configured` and the form shows the failure message: it never pretends to succeed.

## Smoke test with your real credentials (do this once)
1. Publish a portfolio with a contact email you can read. Open it, fill the form, press **Send Message**.
2. Expect "Message sent successfully.", and an email from `CONTACT_FROM` to the owner whose **Reply-To** is the visitor. Reply to it: the reply should go to the visitor.
3. Check Vercel → Logs → `api/contact` for `[contact] provider rejected …` if it fails (the log contains the provider status/name, never the key or the message text). Typical causes: unverified domain (422), wrong key (401), missing env var (503).

## Security notes
* The key exists only in Vercel's environment; the browser never sees it or talks to Resend (verified by test).
* Recipient is looked up server-side by portfolio id (a UUID, validated). Client-sent `to/cc/bcc/from/reply_to/headers` are ignored. CR/LF are stripped from all single-line fields (no header injection); the visitor's text is HTML-escaped in the email.
* Same-origin only: the request must carry our `Origin`, or `Sec-Fetch-Site: same-origin`, or (old browsers) our `Referer`. A direct call from the sandboxed iframe (`Origin: null`) is rejected, which is why the parent relays.
* Honeypot field + rate limits: 5 messages / 10 min per IP and 30 / hour per portfolio, in function memory. **Limitation:** serverless instances are short-lived and not shared, so this slows casual abuse but is not a hard guarantee. For production traffic add a Vercel WAF rate-limit rule on `/api/contact` (Vercel → Firewall) or a shared store such as Upstash Redis.
* No CAPTCHA is included (a third-party service you would have to choose and key). If spam appears, add Cloudflare Turnstile or hCaptcha and verify the token in `api/contact.js`.
* An identical message re-sent within 5 minutes reuses the same Resend idempotency key, so a retry cannot create a second email.

## Known limitations
* Not tested against the real Resend service or a real inbox (no credentials here). Tested: our endpoint over real HTTP against a mock Resend that records exactly what would be sent, plus a real Chromium end-to-end through the real page, iframe and relay.
* Messages are not stored; if Resend is down the visitor sees the failure message and can retry or use the Gmail link.
* `contact_email` is the only supported destination (the owner's login email is not readable without a privileged key, which is deliberately not used).
