// Trade hub prices from live ESI order books (not CCP averages).
const { get, getAllPages, safe, ok, marketPrices } = require('./esi');

const HUBS = {
  Jita: { region: 10000002, station: 60003760, system: 30000142, label: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' },
  Amarr: { region: 10000043, station: 60008494, system: 30002187, label: 'Amarr VIII (Oris) - Emperor Family Academy' },
  Dodixie: { region: 10000032, station: 60011866, system: 30002659, label: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant' },
  Rens: { region: 10000030, station: 60004588, system: 30002510, label: 'Rens VI - Moon 8 - Brutor Tribe Treasury' },
  Hek: { region: 10000042, station: 60005686, system: 30002053, label: 'Hek VIII - Moon 12 - Boundless Creation Factory' }
};

// PLEX only trades on CCP's global market (its own region since July 2025), reachable from any hub.
const GLOBAL_REGION = 19000001;
const GLOBAL_TYPES = new Set([44992]);

const cache = new Map();   // `${hub}:${typeId}` -> { at, data }
const TTL = 5 * 60000;

async function book(typeId, hub = 'Jita') {
  const h = HUBS[hub] || HUBS.Jita;
  const key = hub + ':' + typeId;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const global = GLOBAL_TYPES.has(Number(typeId));
  const orders = await getAllPages(`/markets/${global ? GLOBAL_REGION : h.region}/orders/?type_id=${typeId}&order_type=all`, null, 5);
  const atHub = global ? orders : orders.filter(o => o.location_id === h.station);
  const sells = atHub.filter(o => !o.is_buy_order).sort((a, b) => a.price - b.price);
  // Buy orders reach the hub station if placed there or with a range covering it
  const buys = orders.filter(o => o.is_buy_order && (global || o.location_id === h.station || o.range === 'region' || (o.system_id === h.system && o.range !== 'station')))
    .sort((a, b) => b.price - a.price);
  const data = {
    typeId, hub, global,
    sell: sells[0] ? sells[0].price : null,
    buy: buys[0] ? buys[0].price : null,
    sellVolume: sells.reduce((n, o) => n + o.volume_remain, 0),
    buyVolume: buys.reduce((n, o) => n + o.volume_remain, 0),
    sells: sells.slice(0, 12).map(o => ({ price: o.price, volume: o.volume_remain, issued: o.issued, orderId: o.order_id })),
    buys: buys.slice(0, 12).map(o => ({ price: o.price, volume: o.volume_remain, issued: o.issued, range: o.range, orderId: o.order_id })),
    regionSellMin: Math.min(...orders.filter(o => !o.is_buy_order).map(o => o.price), Infinity),
    raw: orders
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

/** Best sell/buy at a hub for many types; falls back to CCP average when the hub has no orders. */
async function prices(typeIds, hub = 'Jita') {
  const ids = [...new Set(typeIds.filter(Boolean).map(Number))];
  const avg = await marketPrices();
  const res = await pool(ids, 10, async id => {
    const r = await safe(() => book(id, hub));
    return [id, ok(r) ? { sell: r.sell, buy: r.buy, sellVolume: r.sellVolume, buyVolume: r.buyVolume, avg: avg.get(id) || 0 } : { sell: null, buy: null, avg: avg.get(id) || 0, error: r.__error }];
  });
  return Object.fromEntries(res);
}

const histCache = new Map();
async function history(typeId, hub = 'Jita') {
  const h = HUBS[hub] || HUBS.Jita;
  const region = GLOBAL_TYPES.has(Number(typeId)) ? GLOBAL_REGION : h.region;
  const key = region + ':' + typeId;
  const hit = histCache.get(key);
  if (hit && Date.now() - hit.at < 3600000) return hit.data;
  const data = (await get(`/markets/${region}/history/?type_id=${typeId}`)).slice(-180);
  histCache.set(key, { at: Date.now(), data });
  return data;
}

/** Compare a pilot's open orders against the books: returns undercut / outbid status per order. */
async function undercuts(orders) {
  const out = [];
  await pool(orders, 8, async o => {
    const r = await safe(() => getAllPages(`/markets/${o.region_id}/orders/?type_id=${o.type_id}&order_type=${o.is_buy_order ? 'buy' : 'sell'}`, null, 3));
    if (!ok(r)) return;
    const competitors = r.filter(x => x.order_id !== o.order_id && x.location_id === o.location_id);
    if (o.is_buy_order) {
      const best = competitors.reduce((m, x) => Math.max(m, x.price), 0);
      out.push({ orderId: o.order_id, typeId: o.type_id, buy: true, mine: o.price, best: best || null, beaten: best > o.price, by: best > o.price ? best - o.price : 0 });
    } else {
      const best = competitors.reduce((m, x) => Math.min(m, x.price), Infinity);
      out.push({ orderId: o.order_id, typeId: o.type_id, buy: false, mine: o.price, best: isFinite(best) ? best : null, beaten: isFinite(best) && best < o.price, by: isFinite(best) && best < o.price ? o.price - best : 0 });
    }
  });
  return out;
}

module.exports = { GLOBAL_REGION, HUBS, book, prices, history, undercuts, pool };
