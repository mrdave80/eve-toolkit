// Fleet participation tracker (FAT/PAP). Runs in the FC's app while the op is
// live, polling the fleet roster every minute. Everyone seen counts as present.
const corp = require('./corp');
const ws = require('./workspace');

let live = null;   // { id, fcId, fcName, name, doctrine, opId, startedAt, participants: Map, polls, lastPoll, lastError }
let timer = null;
let onUpdate = () => {};

function snapshot() {
  if (!live) return null;
  return {
    id: live.id, fcId: live.fcId, fcName: live.fcName, name: live.name, doctrine: live.doctrine, opId: live.opId,
    startedAt: live.startedAt, lastPoll: live.lastPoll, lastError: live.lastError, polls: live.polls,
    participants: [...live.participants.values()].map(p => ({ ...p, ships: [...p.ships], systems: [...p.systems] }))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
}

async function poll() {
  if (!live) return;
  try {
    const f = await corp.currentFleet(live.fcId);
    live.lastPoll = new Date().toISOString();
    if (!f.inFleet) live.lastError = 'FC is not in a fleet.';
    else if (!f.boss) live.lastError = f.error || 'FC is not fleet boss.';
    else {
      live.lastError = null;
      live.polls++;
      for (const m of f.members) {
        const p = live.participants.get(m.id) || { id: m.id, name: m.name, firstSeen: live.lastPoll, lastSeen: live.lastPoll, seenPolls: 0, ships: new Set(), systems: new Set() };
        p.lastSeen = live.lastPoll; p.seenPolls++;
        if (m.ship) p.ships.add(m.ship);
        if (m.system) p.systems.add(m.system);
        live.participants.set(m.id, p);
      }
    }
  } catch (e) { live.lastError = e.message; }
  onUpdate(snapshot());
}

function start({ fcId, fcName, name, doctrine, opId }) {
  if (live) throw new Error('A fleet is already being tracked. Stop it first.');
  live = { id: null, fcId, fcName, name: name || 'Fleet', doctrine: doctrine || '', opId: opId || null, startedAt: new Date().toISOString(), participants: new Map(), polls: 0, lastPoll: null, lastError: null };
  poll();
  timer = setInterval(poll, 60_000);
  return snapshot();
}

function stop() {
  if (!live) return null;
  clearInterval(timer);
  const s = snapshot();
  const rec = ws.upsert('fleets', {
    name: s.name, doctrine: s.doctrine, opId: s.opId, fcId: s.fcId, fcName: s.fcName,
    startedAt: s.startedAt, endedAt: new Date().toISOString(), polls: s.polls,
    participants: s.participants.map(p => ({ id: p.id, name: p.name, firstSeen: p.firstSeen, lastSeen: p.lastSeen, ships: p.ships, systems: p.systems, seenPolls: p.seenPolls }))
  });
  live = null;
  onUpdate(null);
  return rec;
}

module.exports = { start, stop, snapshot, poll, setListener: fn => { onUpdate = fn; } };
