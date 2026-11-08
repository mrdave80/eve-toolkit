// Member audit: a snapshot a member exports from their own copy of the app
// and hands to corp leadership (no tokens included, read-only data).
const esi = require('./esi');
const extra = require('./esi-extra');
const { app } = require('electron');

const safe = async (fn) => { try { return await fn(); } catch (e) { return { __error: e.message }; } };
const okv = v => v && !v.__error;

async function build(charId) {
  const [o, skills, training, clones, assets, kills, corp, implants] = await Promise.all([
    esi.overview(charId),
    safe(() => esi.skills(charId)),
    safe(() => extra.training(charId)),
    safe(() => esi.clones(charId)),
    safe(() => esi.assets(charId)),
    safe(() => extra.killmails(charId)),
    safe(() => extra.corporation(charId)),
    safe(() => esi.get(`/characters/${charId}/implants/`, charId))
  ]);
  return {
    format: 'eve-companion-audit',
    version: 1,
    appVersion: app.getVersion(),
    exportedAt: new Date().toISOString(),
    character: {
      id: charId, name: o.name, corporation: o.corporation, alliance: o.alliance,
      securityStatus: o.securityStatus, birthday: o.birthday
    },
    summary: {
      totalSp: o.totalSp, unallocatedSp: o.unallocatedSp, wallet: o.wallet,
      system: o.system, docked: o.docked, ship: o.ship ? o.ship.type : null,
      training: o.training ? `${o.training.skill} ${o.training.level}` : null, queueEnd: o.queueEnd,
      spPerHour: okv(training) ? Math.round(training.spPerHour || 0) : null,
      assetValue: okv(assets) ? Math.round(assets.value) : null,
      kills: okv(kills) ? kills.kills : null, losses: okv(kills) ? kills.losses : null
    },
    skills: okv(skills) ? skills.groups.map(g => ({ group: g.name, sp: g.sp, skills: g.skills.map(s => ({ name: s.name, level: s.level, active: s.active })) })) : null,
    queue: okv(training) ? training.queue.filter(e => !e.complete).map(e => ({ name: e.name, level: e.level, finish: e.finish })) : null,
    clones: okv(clones) ? { home: clones.home, jumpClones: clones.jumpClones, activeImplants: clones.activeImplants } : null,
    assets: okv(assets) ? assets.locations.slice(0, 15).map(l => ({ location: l.name, value: Math.round(l.value), items: l.itemCount, top: l.items.slice(0, 8).map(i => ({ name: i.name, quantity: i.quantity, value: Math.round(i.value) })) })) : null,
    history: okv(corp) ? corp.history : null,
    implantsCount: okv(implants) ? implants.length : null
  };
}

module.exports = { build };
