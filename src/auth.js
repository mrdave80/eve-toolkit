// EVE SSO v2 login using OAuth 2.0 Authorization Code + PKCE.
// No client secret is needed or stored: suitable for a desktop app.
const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');

const SSO = 'https://login.eveonline.com';
const USER_AGENT = 'EVE-Toolkit-Desktop/1.8 (Windows; in-game contact: Mr Frank)';

const SCOPES = [
  'publicData',
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-wallet.read_character_wallet.v1',
  'esi-mail.read_mail.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-clones.read_clones.v1',
  'esi-clones.read_implants.v1',
  'esi-location.read_location.v1',
  'esi-location.read_ship_type.v1',
  'esi-location.read_online.v1',
  'esi-industry.read_character_jobs.v1',
  'esi-markets.read_character_orders.v1',
  'esi-assets.read_assets.v1',
  'esi-universe.read_structures.v1',
  'esi-characters.read_blueprints.v1',
  'esi-industry.read_character_mining.v1',
  'esi-industry.read_corporation_jobs.v1',
  'esi-planets.manage_planets.v1',
  'esi-characters.read_agents_research.v1',
  'esi-characters.read_loyalty.v1',
  'esi-characters.read_notifications.v1',
  'esi-characters.read_contacts.v1',
  'esi-calendar.read_calendar_events.v1',
  'esi-characters.read_standings.v1',
  'esi-characters.read_medals.v1',
  'esi-characters.read_fatigue.v1',
  'esi-characters.read_titles.v1',
  'esi-characters.read_corporation_roles.v1',
  'esi-characters.read_fw_stats.v1',
  'esi-killmails.read_killmails.v1',
  'esi-fittings.read_fittings.v1'
];

// Extra scopes requested only for "Add director / FC" logins.
// Opt-in (Settings → In-game control): the user must also tick these on their CCP app registration, or login fails.
const UI_SCOPES = ['esi-ui.write_waypoint.v1', 'esi-ui.open_window.v1'];

const CORP_SCOPES = [
  'esi-corporations.read_corporation_membership.v1',
  'esi-corporations.track_members.v1',
  'esi-corporations.read_structures.v1',
  'esi-corporations.read_starbases.v1',
  'esi-corporations.read_titles.v1',
  'esi-corporations.read_divisions.v1',
  'esi-corporations.read_blueprints.v1',
  'esi-industry.read_corporation_mining.v1',
  'esi-wallet.read_corporation_wallets.v1',
  'esi-assets.read_corporation_assets.v1',
  'esi-contracts.read_corporation_contracts.v1',
  'esi-markets.read_corporation_orders.v1',
  'esi-killmails.read_corporation_killmails.v1',
  'esi-planets.read_customs_offices.v1',
  'esi-fleets.read_fleet.v1'
];

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function decodeJwt(token) {
  const part = token.split('.')[1];
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

function parseAccessToken(accessToken) {
  const p = decodeJwt(accessToken);
  if (!['login.eveonline.com', 'https://login.eveonline.com'].includes(p.iss)) {
    throw new Error('Token issuer not recognised: ' + p.iss);
  }
  const id = Number(String(p.sub).split(':').pop());
  const scopes = Array.isArray(p.scp) ? p.scp : (p.scp ? [p.scp] : []);
  return { id, name: p.name, scopes, exp: p.exp * 1000 };
}

async function tokenRequest(params) {
  const res = await fetch(`${SSO}/v2/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT
    },
    body: new URLSearchParams(params).toString()
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`SSO token request failed (${res.status}): ${text.slice(0, 300)}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return JSON.parse(text);
}

let pending = null;

/**
 * Opens the browser for EVE login, waits for the localhost callback,
 * exchanges the code and returns { tokens, info }.
 */
function login({ clientId, port, corp = false, ui = false }) {
  if (!clientId) return Promise.reject(new Error('Set your EVE developer Client ID in Settings first.'));
  if (pending) pending.cancel('A new login was started.');

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  const redirectUri = `http://localhost:${port}/callback`;

  return new Promise((resolve, reject) => {
    let done = false;
    const handler = async (req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      const finish = (ok, msg) => {
        res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><html><head><title>EVE Toolkit</title></head>
<body style="font-family:Segoe UI,sans-serif;background:#0b0f14;color:#d6e2ee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center"><h2 style="color:${ok ? '#4fd1c5' : '#f56565'}">${ok ? 'Login complete' : 'Login failed'}</h2>
<p>${msg}</p><p style="opacity:.6">You can close this tab and return to EVE Toolkit.</p></div></body></html>`);
      };
      if (url.searchParams.get('state') !== state) { finish(false, 'State mismatch.'); return; }
      const code = url.searchParams.get('code');
      if (!code) { finish(false, url.searchParams.get('error_description') || 'No code returned.'); cleanup(new Error('Login cancelled or denied.')); return; }
      try {
        const tokens = await tokenRequest({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          code_verifier: verifier
        });
        const info = parseAccessToken(tokens.access_token);
        finish(true, `Added <b>${String(info.name).replace(/[<>&]/g, '')}</b>.`);
        cleanup(null, { tokens, info });
      } catch (e) {
        finish(false, 'Token exchange failed. Check the Client ID and callback URL.');
        cleanup(e);
      }
    };
    // Listen on IPv4 and IPv6 loopback only (browsers may resolve "localhost" to either).
    const server = http.createServer(handler);
    const server6 = http.createServer(handler);
    server6.on('error', () => {});

    const timer = setTimeout(() => cleanup(new Error('Login timed out after 5 minutes.')), 5 * 60 * 1000);

    function cleanup(err, result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pending = null;
      setTimeout(() => { server.close(); try { server6.close(); } catch {} }, 500);
      if (err) reject(err); else resolve(result);
    }

    pending = { cancel: reason => cleanup(new Error(reason)) };

    server.on('error', e => cleanup(new Error(
      e.code === 'EADDRINUSE' ? `Port ${port} is in use. Change the callback port in Settings (and in your EVE app registration).` : e.message)));

    server.listen(port, '127.0.0.1', () => {
      try { server6.listen(port, '::1'); } catch {}
      const q = new URLSearchParams({
        response_type: 'code',
        redirect_uri: redirectUri,
        client_id: clientId,
        scope: [...SCOPES, ...(corp ? CORP_SCOPES : []), ...(ui ? UI_SCOPES : [])].join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state
      });
      shell.openExternal(`${SSO}/v2/oauth/authorize?${q.toString()}`);
    });
  });
}

function refresh({ clientId, refreshToken }) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId });
}

module.exports = { login, refresh, parseAccessToken, SCOPES, CORP_SCOPES, UI_SCOPES, USER_AGENT };
