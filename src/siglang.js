'use strict';
/* Probe scanner words in the other EVE client languages (German, French, Russian), mapped to English.
   Strings from the Pathfinder mapper's signature reader. */
const GROUPS = [
  [/^(cosmic anomaly|kosmische anomalie|anomalie cosmique|космическая аномалия)$/i, 'Anomaly'],
  [/^(cosmic signature|kosmische signatur|signature cosmique|скрытый сигнал|источники сигналов)$/i, 'Signature']
];
const TYPES = [
  [/^(combat site|combat|kampfgebiet|site de combat|боевой район)$/i, 'Combat'],
  [/^(relic site|relic|reliktgebiet|site de reliques|археологический район)$/i, 'Relic'],
  [/^(data site|data|datengebiet|site de données|информационный район)$/i, 'Data'],
  [/^(gas site|gas|gasgebiet|site de collecte de gaz|газовый район)$/i, 'Gas'],
  [/^(wormhole|wurmloch|trou de ver|червоточина)$/i, 'Wormhole'],
  [/^(ore site|ore|mineraliengebiet|site de minerai|астероидный район)$/i, 'Ore'],
  [/^(ghost site|ghost|призрачный)/i, 'Ghost']
];
const group = s => { const t = String(s || '').trim(); for (const [re, v] of GROUPS) if (re.test(t)) return v; return /anomal|аномал/i.test(t) ? 'Anomaly' : t ? 'Signature' : ''; };
const type = s => { const t = String(s || '').trim(); if (!t) return ''; for (const [re, v] of TYPES) if (re.test(t)) return v; return t.replace(/ Site$/i, ''); };
module.exports = { group, type };
