// Discord: webhook posts and bot-token role sync (REST only, no gateway).
const ws = require('./workspace');

const API = 'https://discord.com/api/v10';
const UA = 'DiscordBot (https://evewho.com/character/742485678, 1.0) EVE-Toolkit';
const COLORS = { ops: 0x4fd1c5, timers: 0xe8b64c, structures: 0xf56565, srp: 0x63b3ed, hr: 0xb794f4, info: 0x7d8fa3 };

async function postWebhook(kind, { title, description, fields = [], url, color, footer }) {
  const hook = ws.get().discord.webhooks[kind];
  if (!hook) return { skipped: true };
  const body = {
    username: 'EVE Toolkit',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: String(title || '').slice(0, 256),
      description: description ? String(description).slice(0, 4000) : undefined,
      url: url || undefined,
      color: color ?? COLORS[kind] ?? COLORS.info,
      fields: fields.filter(f => f && f.value !== undefined && f.value !== null && f.value !== '').slice(0, 20)
        .map(f => ({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: f.inline !== false })),
      footer: { text: footer || 'EVE Toolkit' },
      timestamp: new Date().toISOString()
    }]
  };
  const res = await fetch(hook + '?wait=true', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Discord webhook (${kind}) failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return { ok: true };
}

async function testWebhook(kind) {
  return postWebhook(kind, { title: 'EVE Toolkit connected', description: `This channel will receive **${kind}** notifications.` });
}

async function bot(method, path) {
  const token = ws.botToken();
  if (!token) throw new Error('No Discord bot token set.');
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(API + path, { method, headers: { Authorization: `Bot ${token}`, 'User-Agent': UA, 'X-Audit-Log-Reason': 'EVE Toolkit role sync' } });
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}));
      await new Promise(r => setTimeout(r, Math.ceil((j.retry_after || 1) * 1000)));
      continue;
    }
    if (res.status === 204) return null;
    const text = await res.text();
    if (!res.ok) { const e = new Error(`Discord ${method} ${path}: ${res.status} ${text.slice(0, 160)}`); e.status = res.status; throw e; }
    return text ? JSON.parse(text) : null;
  }
  throw new Error('Discord rate limit: try again shortly.');
}

async function guildInfo() {
  const d = ws.get().discord;
  if (!d.guildId) throw new Error('Set the Discord server (guild) ID first.');
  const [guild, roles] = await Promise.all([bot('GET', `/guilds/${d.guildId}`), bot('GET', `/guilds/${d.guildId}/roles`)]);
  return { name: guild.name, roles: roles.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name })) };
}

/**
 * memberships: Map<charId, { inCorp: bool, inAlliance: bool, titles: string[] }>
 * Adds/removes the member role (and alliance + title roles) for every linked Discord user.
 */
async function syncRoles(memberships) {
  const d = ws.get().discord;
  if (!d.guildId || !d.memberRoleId) throw new Error('Set the guild ID and member role first.');
  // A user may link several characters: they keep a role if ANY linked character qualifies.
  const perUser = new Map();
  for (const [charId, userId] of Object.entries(d.links)) {
    const m = memberships.get(Number(charId)) || { inCorp: false, inAlliance: false, titles: [] };
    const u = perUser.get(userId) || { corp: false, alliance: false, titles: new Set() };
    u.corp = u.corp || m.inCorp; u.alliance = u.alliance || m.inAlliance;
    (m.titles || []).forEach(t => u.titles.add(t));
    perUser.set(userId, u);
  }
  const managed = [d.memberRoleId, d.allianceRoleId, ...Object.values(d.titleRoles || {})].filter(Boolean);
  const log = { added: 0, removed: 0, unchanged: 0, missing: 0, errors: [] };
  for (const [userId, u] of perUser) {
    let member;
    try { member = await bot('GET', `/guilds/${d.guildId}/members/${userId}`); }
    catch (e) { if (e.status === 404) { log.missing++; continue; } log.errors.push(e.message); continue; }
    const has = new Set(member.roles);
    const want = new Set();
    if (u.corp) want.add(d.memberRoleId);
    if (u.alliance && d.allianceRoleId) want.add(d.allianceRoleId);
    for (const [title, roleId] of Object.entries(d.titleRoles || {})) if (roleId && u.corp && u.titles.has(title)) want.add(roleId);
    let changed = false;
    for (const r of managed) {
      try {
        if (want.has(r) && !has.has(r)) { await bot('PUT', `/guilds/${d.guildId}/members/${userId}/roles/${r}`); log.added++; changed = true; }
        else if (!want.has(r) && has.has(r)) { await bot('DELETE', `/guilds/${d.guildId}/members/${userId}/roles/${r}`); log.removed++; changed = true; }
      } catch (e) { log.errors.push(e.message); }
    }
    if (!changed) log.unchanged++;
  }
  d.lastSync = new Date().toISOString();
  d.lastSyncResult = { ...log, errors: log.errors.slice(0, 5) };
  ws.save();
  return d.lastSyncResult;
}

module.exports = { postWebhook, testWebhook, guildInfo, syncRoles };
