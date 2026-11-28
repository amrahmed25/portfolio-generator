// Local stand-ins for Supabase REST and Resend, used by the contact tests.
// They let the tests inspect EXACTLY what api/contact.js sends to the email provider.
import http from 'http';

export const PORTFOLIOS = {
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': { title: 'Alice Portfolio', contact_email: 'alice@alice-owner.test', is_published: true },
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb': { title: 'Bob Portfolio', contact_email: 'bob@bob-owner.test', is_published: true },
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc': { title: 'Draft', contact_email: 'carol@carol-owner.test', is_published: false },
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd': { title: 'No email', contact_email: null, is_published: true }
};

export function startSupabase() {
  const state = { requests: [], fail: false };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); state.requests.push({ url: req.url, headers: req.headers });
    if (state.fail) { res.statusCode = 500; return res.end('{}'); }
    const id = (u.searchParams.get('id') || '').replace(/^eq\./, ''); const pub = u.searchParams.get('is_published') === 'eq.true';
    const row = PORTFOLIOS[id]; res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(row && (!pub || row.is_published) ? [{ title: row.title, contact_email: row.contact_email }] : []));
  });
  return new Promise(r => server.listen(0, () => r({ server, state, url: `http://localhost:${server.address().port}` })));
}

export function startResend() {
  const state = { sent: [], mode: 'ok', count: 0, delayMs: 0 };
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
      state.sent.push({ headers: req.headers, body: JSON.parse(raw || '{}') }); res.setHeader('content-type', 'application/json');
      if (state.mode === 'hang') return;                                           // never answers
      if (state.delayMs) return setTimeout(() => respond(), state.delayMs);
      respond();
    });
    function respond() {
      if (state.mode === 'http500') { res.statusCode = 500; return res.end(JSON.stringify({ name: 'internal_server_error', message: 'boom SECRET-PROVIDER-DETAIL' })); }
      if (state.mode === 'http401') { res.statusCode = 401; return res.end(JSON.stringify({ name: 'restricted_api_key', message: 'API key is invalid' })); }
      if (state.mode === 'http422') { res.statusCode = 422; return res.end(JSON.stringify({ name: 'validation_error', message: 'domain not verified' })); }
      if (state.mode === 'http429') { res.statusCode = 429; return res.end(JSON.stringify({ name: 'rate_limit_exceeded' })); }
      if (state.mode === 'noid') { res.statusCode = 200; return res.end(JSON.stringify({})); }
      if (state.mode === 'garbage') { res.statusCode = 200; return res.end('<html>not json</html>'); }
      res.statusCode = 200; res.end(JSON.stringify({ id: 'msg_' + (++state.count) }));
    }
  });
  return new Promise(r => server.listen(0, () => r({ server, state, url: `http://localhost:${server.address().port}/emails` })));
}
