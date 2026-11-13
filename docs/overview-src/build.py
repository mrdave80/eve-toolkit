"""Builds overview.html (A4 landscape pages) from the app screenshots."""
import os, html
from PIL import Image

SRC = '/home/claude/eve-companion/scripts/screens/out/overview'
OUT = '/home/claude/overview'
IMG = os.path.join(OUT, 'img'); os.makedirs(IMG, exist_ok=True)

def jpg(name, width=1100):
    src = os.path.join(SRC, name + '.png')
    dst = os.path.join(IMG, name + '.jpg')
    if not os.path.exists(dst):
        im = Image.open(src).convert('RGB')
        if im.width > width: im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.save(dst, quality=56, optimize=True, progressive=True)
    return 'img/' + name + '.jpg'

LOGO = '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".35"/><path d="M16 3a13 13 0 0 1 12.6 9.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="16" cy="16" r="4.2" fill="currentColor"/></svg>'
VERSION = '1.12.0'

pages = []
def page(body, cls=''):
    pages.append(f'<section class="page {cls}">{body}</section>')

def feature(section, title, intro, bullets, shots, layout='one'):
    """layout: one = big shot right; two = two shots stacked/side; wide = shot full width under text"""
    b = ''.join(f'<li>{x}</li>' for x in bullets)
    text = f'<div class="kicker">{section}</div><h2>{title}</h2><p class="intro">{intro}</p><ul>{b}</ul>'
    if layout == 'two':
        imgs = ''.join(f'<figure><img src="{jpg(s)}"><figcaption>{c}</figcaption></figure>' for s, c in shots)
        page(f'<div class="split2"><div class="txt">{text}</div><div class="shots2">{imgs}</div></div>')
    else:
        s, c = shots[0]
        page(f'<div class="split"><div class="txt">{text}</div><figure class="hero"><img src="{jpg(s)}"><figcaption>{c}</figcaption></figure></div>')

# ---------- Cover ----------
page(f"""
<div class="cover">
  <div class="cover-l">
    <div class="logo">{LOGO}</div>
    <h1>EVE TOOLKIT</h1>
    <div class="tag">A Windows desktop app for EVE Online pilots, corporations and alliances</div>
    <div class="cover-meta">App overview · version {VERSION}<br>By <b>Mr Frank</b> · free to use</div>
    <div class="cover-pills"><span>Pilots &amp; training</span><span>Industry &amp; PI</span><span>Market &amp; finance</span><span>Navigation &amp; wormholes</span><span>Intel &amp; threat grades</span><span>Overlay &amp; spoken alerts</span><span>Corp &amp; alliance tools</span></div>
  </div>
  <figure class="cover-shot"><img src="img/cover-tilt.png"></figure>
</div>""", 'cover-page')

# ---------- At a glance ----------
groups = [
  ('Pilots &amp; training', ['Wallet, SP, location and ship for each pilot', 'Skill queue with per-level detail', 'Skill planner, remaps and “Can I fly…?”', 'Fit checker with DPS, tank and capacitor']),
  ('Industry &amp; PI', ['Jobs and free slots across your pilots', 'Build, invention and reprocessing calculators', 'Asset finder, shopping lists and What to Build', 'Ore, ice and gas ISK per m³, PI watchdog', 'Job splitter, blueprint prices, ice and ore sites', 'PI chain planner and moon scan value']),
  ('Market &amp; finance', ['Hub order books, price history, appraisal', 'Trade profit, station trading scanner, price alerts', 'Net worth history and income by source', 'Ratting, Abyss, skill farm and character value']),
  ('Navigation', ['Routes through gates, wormholes and Thera/Turnur', 'Gate camp and gank check on each route', 'Live region map with kill heat and intel', 'Wormhole mapper with rolling and map import', 'Hunting grounds, gate camps, agent finder']),
  ('Intel', ['Pilot lookup with a 0–100 threat grade', 'System Intel with battle reports', 'Intel channel watch with graded alerts', 'Local and d-scan with danger warnings', 'Wormhole residents and the Wall of Shame']),
  ('Corporation', ['Members, structures, moons, fuel and leaderboard', 'Doctrines, op calendar, fleet tracking', 'SRP, timerboard, recruit spy check', 'Daily reset, clone jump, fatigue and incursion alerts']),
]
cards = ''.join(f'<div class="gcard"><h3>{t}</h3><ul>{"".join(f"<li>{x}</li>" for x in xs)}</ul></div>' for t, xs in groups)
page(f"""
<div class="kicker">Overview</div><h2>What the app covers</h2>
<p class="intro wide">EVE Toolkit reads your pilots’ data from CCP’s ESI and shows it as boards, planners, calculators and alerts. Solo tools work in any area of space. Directors and FCs get corp and alliance tools on top.</p>
<div class="ggrid">{cards}</div>
<div class="facts">
  <div><b>Data stays on your PC</b><span>You log in with CCP’s EVE SSO. The app encrypts your tokens and keeps them on your PC.</span></div>
  <div><b>Read-only by default</b><span>The app can’t move ISK or items. Waypoints, sending mail and saving fits are opt-in extras.</span></div>
  <div><b>Portable</b><span>One Windows .exe or a Linux AppImage. No installer, account or server. Updates in one click.</span></div>
  <div><b>Free</b><span>All features are free to use. ISK or PLEX donations to Mr Frank are optional.</span></div>
</div>""")

# ---------- New in 1.12 ----------
S = 'New in 1.12'
feature(S, 'System Intel and battle reports', 'Search any system and look back 6, 12, 24 or 48 hours: who is killing, in what, where, and when. Kills close together are grouped into battles with both sides’ losses.',
  ['Gate and undock camps called out, with the latest kill time', 'Most active pilots and every kill with its attackers', 'Your own intel channel reports for the system', 'What’s happening within two jumps right now'],
  [('C0-sysintel', 'System Intel with battle reports')])
feature(S, 'Help guides and walkthroughs', 'Every tool has a guide with steps, tips and screenshots. Press ? or F1 on any page for its guide, or let the app walk you through it, highlighting each control in turn.',
  ['Searchable, and found by Ctrl+K search', 'Guides open on the page you’re on', 'Walkthroughs open the tool for you', 'Tips on what each tool needs, like roles or scopes'],
  [('C1-help', 'Help and guides'), ('C2-walk', 'A walkthrough step')], 'two')
feature(S, 'Wormholes: rolling and importing', 'The rolling planner works out which ships to send, hot or cold, so the hole closes on a jump back. Maps import from Pathfinder, Wanderer, Nexum or a plain list of systems.',
  ['Every jump out checked against the lightest the hole could be (±10%)', 'Tells you when the hole should look reduced or critical', 'Signatures gone from your scanner crossed out, deleted in one go', 'Shared maps keep reduced and critical mass'],
  [('D0-whroll', 'Rolling planner'), ('65-wh-share', 'Share and import maps')], 'two')
feature(S, 'Station trading and trade profit', 'Station Trading scans a whole hub for spreads that beat your own fees, filtered by what really trades each day. Trade Profit now splits station trading from hauling and offers weighted average cost.',
  ['Sales tax and broker fee from a pilot’s skills', 'Profit a day for the share of trades you expect to win', 'Suspicious prices marked for a second look', 'Leave single buys, items or stations out of profit'],
  [('D5-station', 'Station trading scanner'), ('55-trade', 'Trade profit by style')], 'two')
feature(S, 'Job splitter and blueprint prices', 'Paste what you want built and get jobs for every pilot’s free slots, each under a time limit you pick. Blueprint Prices shows what originals and copies really sell for on contracts.',
  ['Uses blueprint copies first and keeps them with their owner', 'Materials with where you already have them, plus a Multibuy list', 'Copies priced per run, with ME and TE', 'Only single-blueprint contracts, so packs don’t skew prices'],
  [('D6-split', 'Job splitter'), ('D7-bpprices', 'Blueprint prices')], 'two')
feature(S, 'Ice and ore sites, moon chunks', 'Sightings come from your probe scans and intel channels, with an alert when ice or an ore site turns up near your pilots. Directors are told when moon chunks are about to arrive and when they’re ready.',
  ['Copy the probe scanner in game and it’s added by itself', 'Sites gone on a later scan are crossed out', 'Remembers which systems have had ice', 'Moon chunks with jumps from your nearest pilot'],
  [('DB-mining', 'Ice and ore sightings'), ('DC-moonchunks', 'Moon chunks')], 'two')
feature(S, 'Corp fuel and leaderboard', 'Fuel shows each structure’s bay, burn a day and days left, and how long the fuel blocks and magmatic gas in corp hangars will last. The leaderboard ranks members by ratting tax and moon mining.',
  ['Burn worked out from the bay and CCP’s run-out time', 'Reserves listed by hangar and fuel type', 'Ratting earnings worked back from the corp’s tax', 'Moon ore mined at corp drills, per member'],
  [('D9-fuel', 'Structure fuel'), ('DA-leaderboard', 'Ratting leaderboard')], 'two')
feature(S, 'Killmail appraisal and offline mode', 'Paste a kill link into Appraisal to see what dropped and what was destroyed. When Tranquility is down the app says so, shows the last data it loaded and reloads by itself when the server is back.',
  ['Works with zKillboard links and in-game kill links', 'Dropped, destroyed and hull values at hub prices', 'Banner with how long the server has been down', 'Checks every 30 seconds, no endless spinners'],
  [('D8-killappraise', 'Appraising a kill'), ('D1-offline', 'Server offline banner')], 'two')
feature(S, 'Intel Watch details and a clearer live map', 'Click a kill spike near you for the kills, attackers and camps behind it, or a pilot in Local for what they said, what they fly and why they were graded. The live map no longer overlaps systems.',
  ['Tag a pilot as hostile from the Local list', 'Links to System Intel and zKillboard', 'Constellation names and extra detail when zoomed in', 'The map uses the full width of the panel'],
  [('DD-intel-expand', 'Kill activity details'), ('42-livemap', 'Live map')], 'two')

# ---------- New in 1.11 ----------
S = 'New in 1.11'
feature(S, 'Route planner places and Daily Goals', 'Start typing a destination to pick a system, station or one of your structures, with how many of your items are there. Daily Goals open per pilot so you can see each goal and tick it off.',
  ['Favourites for one-click routes, and a station list for any system', 'Autopilot set to the station itself, not just the system', 'Set today\u2019s goals once; they\u2019re the same for every pilot', 'Two goals ticked marks the pilot done and moves the monthly track'],
  [('B0-route-places', 'Destination search with your items at each station'), ('52-daily', 'Daily Goals checklist')], 'two')
feature(S, 'D-scan warnings and order updates', 'Pasted d-scans are sorted by role, with the dangerous things first. My Orders steps through outbid orders: it copies a winning price and opens the market in game.',
  ['Supercapitals, recons, interdictors, HICs and bombers flagged', 'Cynos, bubbles, probes and mobile tractor units called out', 'Prices respect EVE\u2019s four-digit rule', 'Ctrl+Alt+N updates the next order while you\u2019re in game'],
  [('98-dscan', 'D-scan with roles and warnings'), ('99-orders', 'Updating outbid orders')], 'two')
feature(S, 'PI watchdog', 'From each colony\u2019s last saved state, the app works out when storage fills and when factories run out of inputs, not just when extractors stop.',
  ['Alerts a set number of hours ahead', 'Two reminders if nothing changes; clears once you fix it', 'Snooze any colony for 12 hours', 'Planets board lists colonies that need a visit within a day'],
  [('A2-pi-watch', 'Planets board with the watchdog')])
feature(S, 'Shopping list and What to Build', 'The build calculator takes what your pilots already own off the materials list. What to Build ranks your own blueprints by profit per day, capped by what the market really buys.',
  ['Checks you have the blueprint, and where it is', 'Copies the rest for EVE\u2019s Multibuy window', 'Profit after sales tax and broker fee', 'Build \u25b8 opens any product in the calculator'],
  [('A3-shopping', 'Shopping list from your hangars'), ('A4-what-to-build', 'What to Build')], 'two')
feature(S, 'Agent Finder and LP stores', 'Find agents by level, division, faction and distance, with mission hubs. Buy with LP finds every NPC store that sells an item and its nearest station.',
  ['Highsec only and locator agents filters', 'Set destination to an agent in one click', 'LP, ISK and items each store asks for', 'Opens the full LP store for any corporation'],
  [('A5-agents', 'Agent Finder'), ('A6-lp-search', 'Buy with LP')], 'two')
feature(S, 'Gate camps and busy hours', 'A gate camp mode for pilots who want a fight lists active camps near you. System cards show kills by day and hour, so you know when a system is quiet.',
  ['Who is camping, in which ships, how recently', 'Smartbombs and bubbles flagged', 'Busiest and quietest hours in your time zone', 'Check any camper\u2019s threat grade from the list'],
  [('A7-camps', 'Gate camps to fight'), ('A0-sys-heat', 'System busy hours')], 'two')
feature(S, 'Compare skills, streamer mode and incursions', 'Compare up to 10 pilots\u2019 skills side by side with CSV export. Streamer mode blurs names, wallets and locations. Incursion payouts show as their own income with ISK per hour.',
  ['Only show skills where pilots differ', 'Skills and queues to CSV', 'Ctrl+Shift+H toggles streamer mode', 'Planner removes skills you\u2019ve already trained'],
  [('A1-compare', 'Compare skills'), ('A9-streamer', 'Streamer mode')], 'two')

# ---------- Quick looks ----------
S = 'Quick looks'
feature(S, 'Pilot and system cards', 'Click a pilot or system name almost anywhere and a card opens over the page, so you don’t lose your place.',
  ['Pilot card: threat grade and reasons, kills, ships flown, recent activity', 'System card: kills and jumps this hour, sov, planets and gates', 'Wormholes show class, effect and statics', 'Buttons for the full profile, a route, the live map or zKillboard'],
  [('70-pop-pilot', 'Pilot card'), ('72-pop-system', 'System card')], 'two')
feature(S, 'Item cards and route popups', 'Click any item icon for its prices and stats. Route links on the live map, hunting list and Nearby planets plot the route in a popup with camp and gank warnings.',
  ['Hub prices, build cost and key stats', 'Which of your pilots can use it', 'Routes with hazards, editable without leaving the page', 'Open in the item database or route planner for more'],
  [('71-pop-item', 'Item card'), ('73-pop-route', 'Route popup')], 'two')
feature(S, 'More detail when you want it', 'Rows marked ▸ open to show more, and close again to keep pages short.',
  ['Trade profit: each sale matched to its buys, and each pilot’s share', 'Wall of Shame: the evidence behind each tag, and the full fit', 'Contract bargains: every item, and what they want in return', 'Routes, courier contracts, fits, ratting ticks, Abyss loot and Pilot Intel kills'],
  [('77-trade-expand', 'Trade profit sale details'), ('78-shame-expand', 'Why a loss is on the Wall of Shame')], 'two')

# ---------- Features ----------
S = 'Pilots &amp; training'
feature(S, 'All pilots', 'The home board lists each pilot you add, with their current skill, queue length, wallet, skill points, location and ship.',
  ['Gold or red warnings before a queue runs out', 'Combined skill points and ISK', 'Online status and current ship', 'Drag pilots in the sidebar to reorder them'],
  [('01-dashboard', 'All pilots board with five demo pilots')])
feature(S, 'Pilot summary and skill queue', 'Each pilot has tabs for character, skills, industry, finance, comms, assets and combat. Click a skill in the queue to see each level with SP, time and attributes.',
  ['Training panel with a live countdown', 'SP per hour and finish time for each queued level', 'Corporation, standings, contacts and medals', 'Audit export for your corp’s recruiters'],
  [('02-summary', 'Pilot summary'), ('03-queue', 'Expanded skill queue')], 'two')
feature(S, 'Skill planner', 'Build a skill plan for each pilot. Add a ship or module and the planner adds its prerequisites. It times the plan from your live queue, so your implants count.',
  ['Remap optimiser for the plan’s attributes', 'Import plans as text and copy them back into EVE', '“Can I fly…?” checks an item against all your pilots', 'Training board compares queues side by side'],
  [('04-planner', 'Skill planner with “Can I fly…?”'), ('05-training-board', 'Training board')], 'two')

feature(S, 'Fit checker', 'Paste a fit from the game or Pyfa. The checker counts slots, CPU, powergrid and calibration with each pilot’s skills, shows who can fly it and what it costs, and lists the hull’s base stats.',
  ['Over-fitted slots and hardpoints flagged', 'Each pilot: can fly, time to train, and whether it fits', 'Open a pilot’s row for the missing skills, ready to copy as a plan', 'Appraise and Open in Pyfa in one click'],
  [('81-fit-expand', 'Fit checker with missing skills'), ('66-fit-appraise', 'Fit appraisal')], 'two')

S = 'Industry &amp; planetary interaction'
feature(S, 'Industry and planets boards', 'The industry board lists manufacturing, research and reaction jobs across your pilots and highlights free slots. The planets board lists each colony and when its extractors stop.',
  ['Job timers and idle-slot alerts', 'Value of jobs in progress at current prices', 'Alerts before an extractor stops', 'Mining ledger with daily ore totals'],
  [('06-industry-board', 'Industry board'), ('07-planets-board', 'Planets board')], 'two')
feature(S, 'Build calculator', 'Price a build with your blueprint ME, structure, rigs, security status and the system’s live cost index. For each component, the calculator compares building it with buying it.',
  ['Materials and job cost at hub prices', 'Invention with decryptor comparison', 'Reprocessing yield calculator', 'Blueprint library with ME, TE and runs'],
  [('15-build', 'Build calculator')])
feature(S, 'Moon scan value', 'Paste survey scan results for one moon or many. Each moon gets its best ore rating, ISK per m³ and its value per extraction and per month.',
  ['R4 to R64 rating for each moon', 'Each ore valued raw or refined, whichever pays more', 'Set extraction length, drill rate and refine yield', 'Jita sell or buy prices'],
  [('56-moon', 'Moon scan value')])
feature(S, 'PI chain planner', 'Pick a product and a daily target. The planner lays out the chain from planet types to the product, counts the planets and factories you need, and values each tier.',
  ['Chain graph from planet types up to P4', 'Fits the plan to your colony limit', 'Value per tier after export and customs tax', 'Option to buy intermediate products instead'],
  [('10-pi-planner', 'PI planner')])
feature(S, 'Nearby planets', 'Find the closest systems with the planet types you need for PI, from any system or one of your pilots.',
  ['Pick planet types and match any or all in one system', 'Limit by jumps and by highsec, lowsec, nullsec or Pochven', 'Nearest system for each type shown first', 'Route and Dotlan links on each system'],
  [('63-nearby-planets', 'Nearby planets')])

S = 'Market &amp; finance'
feature(S, 'Market browser and appraisal', 'Order books from the five trade hubs, with a six-month price chart. Paste a cargo scan, contract, fit or inventory to value it.',
  ['Sell and buy books with depth and spread', 'Appraisal at sell, buy or split price', 'Undercut and outbid checks on your orders', 'Arbitrage between Jita, Amarr, Dodixie, Rens and Hek'],
  [('12-market', 'Market browser'), ('13-appraisal', 'Appraisal')], 'two')
feature(S, 'Trade profit', 'Real profit from your trading. Each sale is matched to the oldest buys of the same item, after sales tax and broker fees. The app keeps its own record past the 30 days ESI shares.',
  ['Profit after fees, per day and per item', 'Margin, average time held and stock on hand', 'Match buys and sells across pilots', 'Sales with no matching buy shown separately'],
  [('55-trade', 'Trade profit')])
feature(S, 'Contract bargains and item database', 'The bargain finder scans public contracts for anything priced well under Jita, and remembers what it has read so later scans are quick. The item database shows any item’s stats, skills, blueprint and prices.',
  ['Minimum profit, discount, price cap and highsec filter', 'Likely scams flagged for a careful look', 'Stats, required skills and “Who can use it?”', 'Built from, reprocesses into and used to build'],
  [('59-bargains', 'Contract bargains'), ('58-items', 'Item database')], 'two')
feature(S, 'LP store and wallet', 'The LP store ranks offers by ISK per LP against real buy orders. The wallet tab shows each pilot’s journal.',
  ['Required items included in the ISK per LP', 'Wallet journal and transactions', 'Assets by location, with values', 'Contracts, market orders and mail'],
  [('14-lp-store', 'LP store'), ('08-wallet', 'Wallet')], 'two')
feature(S, 'Net worth and income', 'A daily snapshot of wallets and assets builds your net worth history. The income page splits ISK by source and shows ratting ISK per hour.',
  ['Net worth chart per pilot and in total', 'Income and spending by journal category', 'Ratting ticks and ISK per hour', 'Assets valued at hub prices'],
  [('25-networth', 'Net worth'), ('26-income', 'Income')], 'two')
feature(S, 'Skill farm and character value', 'The skill farm page works out what each pilot makes in a month from extracting SP, after Omega or MCT costs. Character value shows what each pilot’s SP is worth extracted and what it would cost a buyer to inject.',
  ['SP per day from each pilot’s current skill, implants included', 'PLEX priced on CCP’s global PLEX market', 'Extract value and cost to inject for each pilot', 'Skills buyers pay more for, like capitals and Cyno V'],
  [('53-farm', 'Skill farm'), ('60-charvalue', 'Character value')], 'two')
feature(S, 'Insurance', 'Compares CCP’s insurance payout for each pilot’s current ship, and any ship you add, with what the hull sells for in Jita.',
  ['Platinum cost, payout and net if lost', 'How much of the hull price it covers', 'Every insurance level listed', 'Check any ship by name'],
  [('54-insure', 'Insurance')])
feature(S, 'Ratting and Abyss ISK per hour', 'The ratting tab groups bounty ticks and ESS payouts into sessions and works out ISK per hour for each pilot and system. The Abyss tracker times each run on its own and values the loot.',
  ['Sessions split where there’s a gap of more than 30 minutes', 'Best systems ranked by ISK per hour', 'Abyss runs timed automatically from your pilots’ location', 'Profit per filament tier, after filament cost'],
  [('47-pve', 'Ratting and Abyss ISK per hour')])

S = 'Navigation'
feature(S, 'Route planner with gate camp check', 'Plan a route through stargates, your mapped wormholes and public Thera and Turnur connections. The planner then checks each system on the route for recent kills.',
  ['Flags camps on the gates you’ll jump through', 'Flags highsec suicide ganks and smartbomb camps', 'One click to avoid hot systems and re-route', 'Opt-in: send the route to EVE as waypoints'],
  [('16-route', 'Route planner with route safety')])
feature(S, 'Alliance jump bridges', 'Paste your alliance’s Ansiblex list and the route planner uses the bridges. Lines like “A » B”, “A <-> B” or two names separated by a tab all work.',
  ['Bridges kept on your PC', 'Routes mark each bridge jump', 'Turn bridges on or off per route', 'Waypoints sent to EVE stop before the first bridge'],
  [('50-route-bridges', 'Jump bridge list')])
feature(S, 'Live region map', 'A map of the region with CCP’s hourly kill and jump stats. Systems glow by kills, and intel reports from your channels show on the map as they come in.',
  ['Heat by ship and pod kills, NPC kills or jumps', 'Sov view shows who holds each system', 'Click a system for its stats and recent kills', 'Your pilots, jump bridges and mapped wormholes shown'],
  [('42-livemap', 'Kill heat'), ('43-livemap-sov', 'Sovereignty')], 'two')
feature(S, 'Hunting grounds and safe ratting', 'Hunting ranks nearby systems where people are ratting and few are dying. Safe ratting turns it round and finds quiet systems with live anomalies and little PvP.',
  ['Search within a set number of jumps', 'Filter by highsec, lowsec and nullsec', 'Check a system’s last three hours on zKillboard', 'Optional: count your jump bridges'],
  [('44-hunting', 'Hunting grounds'), ('45-ratting', 'Safe ratting')], 'two')
feature(S, 'Courier contracts', 'Public courier contracts ranked by ISK per jump, including the trip to the pickup. Filter by volume, collateral, reward and highsec-only routes.',
  ['Flags routes that leave highsec', 'Flags collateral that’s high for the reward', 'Gank and camp check on each route', 'Look up the issuer before you accept'],
  [('17-courier', 'Courier contracts')])
feature(S, 'Jump planner and universe', 'Plan capital and jump freighter routes with jump range and an estimate of jump fatigue. The universe page lists sov campaigns, incursions, Thera connections and faction warfare.',
  ['Fewest jumps for capitals, Black Ops and JFs', 'Systems in jump range of a chosen system', 'Sov timers, incursions and contested FW systems', 'Thera and Turnur holes from EVE-Scout'],
  [('18-jump', 'Jump planner'), ('19-universe', 'Universe')], 'two')
feature(S, 'Wormhole mapper', 'Pick pilots to track and the mapper adds systems as they jump, or add systems yourself. Select a system to see its class, statics and effect.',
  ['Maps the chain from your pilots’ jumps', 'Statics and system effect for every J-space system', 'Paste signatures from the probe scanner', 'Share maps with corp officers'],
  [('57-whinfo', 'Wormhole mapper with system info')])
feature(S, 'Sharing wormhole maps', 'Send a map to your corp or alliance as text for Discord or EVE mail, or as a file. Anyone with EVE Toolkit can bring it in as a new map or merge it into theirs.',
  ['Systems, connections, signatures, labels and notes', 'Merge adds only what you don’t have yet', 'Your own notes and home system are kept', 'Codes are checked before anything is imported'],
  [('65-wh-share', 'Share wormhole maps')])

S = 'Intel'
feature(S, 'Pilot Intel and threat grades', 'Enter a pilot’s name to see their public record from ESI and zKillboard. The app grades their threat from 0 to 100 and lists the reasons, with a grade for highsec, lowsec, nullsec, wormholes and Pochven.',
  ['Flags gankers, hotdroppers, cyno pilots and bubblers', 'Ships used, active hours, recent kills and losses', 'Your watchlist: tag pilots hostile, ganker or friendly', 'Blues and pilots tagged friendly grade Minimal'],
  [('20-pilot-intel', 'Pilot Intel profile')])
feature(S, 'Recruit spy check', 'Check applicants before you give them roles. The spy check weighs corp hopping, character age, ties to groups you’re red to, awox kills and kills on your members.',
  ['Grades Looks OK, Review or High risk, with reasons', 'Time spent in each past corp', 'Check all open applications at once', 'Results sync to your other officers'],
  [('21-spy-check', 'Recruit spy check')])
feature(S, 'Wormhole residents', 'Enter a J-sig to see who lives there, who hunts there and who keeps dying there, from the hole’s recent kills on zKillboard.',
  ['Roles: likely resident, regular hunter, dies here often, possibly evicted', 'Active hours in EVE time', 'Structures lost and when', 'Groups with the most kills in the hole'],
  [('46-whres', 'Wormhole residents')])
feature(S, 'Wall of Shame', 'The worst losses of the last day or week, from New Eden or your own corp and alliance. The app reads each fit and tags what went wrong.',
  ['Tags: naked, half fitted, no tank, rainbow, bling, autopilot', 'Biggest oofs, repeat offenders and feeder corps', 'Filter by space and by tag', 'Copy a loss for Discord in one click'],
  [('48-shame', 'Wall of Shame')])
feature(S, 'Local, d-scan and intel channels', 'Paste Local or a d-scan, or turn on the clipboard watcher and copy them in game. The intel watcher reads your intel channels and alerts you when hostiles are near your pilots.',
  ['Grades everyone in Local and sorts by threat', 'Grades pilots named in intel and Local chat', 'Kill-spike alerts for ganking near your pilots', 'Clipboard watcher stays off until you enable it'],
  [('22-local', 'Local graded'), ('23-intel-watch', 'Intel watch')], 'two')
feature(S, 'Combat log', 'A damage meter that reads EVE’s combat logs and shows damage dealt and taken per second, your top targets and your weapons.',
  ['DPS in and out, live and over 60 seconds', 'Damage totals for the session', 'Top targets and weapons', 'One panel per logged-in pilot'],
  [('24-combat', 'Combat log')])

S = 'While you play'
b = ''.join(f'<li>{x}</li>' for x in ['Your system, Local threats, route and nearby kill spikes', 'Click-through when locked, so it never steals a click', 'Ctrl+Shift+O shows or hides it, Ctrl+Shift+L locks it', 'Uses the same theme as the app, glass included', 'Drag to move or resize; it remembers where you left it'])
page(f"""<div class="split ov"><div class="txt"><div class="kicker">{S}</div><h2>Overlay</h2>
<p class="intro">A small see-through window that sits over the EVE client. It shows the pilot you pick and updates as they jump.</p><ul>{b}</ul></div>
<figure class="ovshot"><img src="{jpg('51-overlay')}"><figcaption>Overlay over the game</figcaption></figure></div>""")
feature(S, 'Daily rewards and EVE news', 'ESI doesn’t share login rewards or Daily Goals, so the app works around it. It tells you when the server is back after downtime, reminds you about pilots you haven’t ticked, and reads CCP’s news for login campaigns and SP events.',
  ['Tranquility up and long-downtime alerts', 'Daily Goals ticks and the 12-step monthly track per pilot', 'Warning when a pilot is running out of days for the month', 'Alerts on login rewards, SP events and free items, with end dates'],
  [('52-daily', 'Daily rewards and EVE news')])
feature(S, 'Spoken alerts', 'Hear alerts while the game has focus. Windows voices read them out, for example “Hostile, 2 jumps, Tama. Extreme threat.”',
  ['Choose voice, speed and volume', 'Speak intel near your pilots, Local threats, kill spikes, Abyss finished', 'Works with the app minimised', 'Phone alerts on the same page'],
  [('49-speech', 'Spoken and phone alerts')])

S = 'Corporation &amp; alliance'
feature(S, 'Corp overview and members', 'Log in a director or FC to open the corp tools: members with roles and last login, compliance, audits, and upcoming ops and timers.',
  ['Member list with roles and activity', 'Compliance check against required permissions', 'Audits imported from members’ exports', 'Main and alt linking'],
  [('27-corp-overview', 'Corp overview'), ('28-corp-members', 'Members')], 'two')
feature(S, 'Structures, moons and moon tax', 'Track structure fuel, state and timers, with alerts. Moon tax turns the mining ledger into invoices and matches payments in the corp wallet.',
  ['Fuel countdowns and attack alerts', 'Moon extraction schedule', 'Moon tax invoices with payment matching', 'Buyback quotes and contract checks'],
  [('29-corp-structures', 'Structures'), ('30-corp-moontax', 'Moon tax')], 'two')
feature(S, 'Doctrines, ops and fleets', 'Paste EFT fits to build doctrines and see which members can fly them. Plan ops, record fleet participation and keep a shared timerboard.',
  ['Doctrine cost and who can fly each fit', 'Op calendar with Discord pings', 'Fleet tracker and participation records', 'Timerboard with reminders'],
  [('31-corp-doctrines', 'Doctrines'), ('40-fats', 'Fleet participation')], 'two')
feature(S, 'SRP, recruitment and Discord', 'Check ship replacement requests against your rules, manage applications with notes and spy checks, and post updates to Discord.',
  ['SRP from killmail links, with rule checks', 'Applications with status, notes and audits', 'Discord webhooks and role sync', 'Shared-folder sync between officers'],
  [('34-corp-srp', 'SRP'), ('35-corp-hr', 'Recruitment')], 'two')

# ---------- Settings ----------
themes = [('capsuleer', 'Capsuleer', 'Default'), ('concord', 'Concord Highsec', 'Highsec · PvE'), ('amarr', 'Imperial Gold', 'Highsec · Incursions'), ('caldari', 'State Steel', 'Trading · Industry'),
  ('gallente', 'Federation Verdant', 'Exploration'), ('minmatar', 'Rust Republic', 'Lowsec · FW'), ('nullsec', 'Sov Bloc', 'Nullsec · Fleets'), ('wormhole', 'J-Space Void', 'Wormholes'),
  ('abyssal', 'Abyssal Crimson', 'PvP · Abyss'), ('industrialist', 'Ore Hauler', 'Mining · Industry'), ('daylight', 'Station Lights', 'Light mode')]
tgrid = ''.join(f'<figure class="tcard"><img src="{jpg("theme-" + k, 900)}"><figcaption><b>{n}</b> · {t}</figcaption></figure>' for k, n, t in themes)
page(f"""<div class="kicker">Settings</div><h2>Themes</h2>
<p class="intro wide">Twenty-one themes, each tagged with the play style it suits. You can set your corp colour as the highlight, or have the theme change with the area of space your pilot is in. The overlay follows the theme too.</p>
<div class="tgrid">{tgrid}</div>""")
gthemes = [('glass-nebula', 'Nebula Glass', 'Any space'), ('glass-ice', 'Ice Field Glass', 'Highsec · Trading'), ('glass-drifter', 'Drifter Glass', 'Wormholes · PvP'), ('glass-solar', 'Solar Glass', 'Mining · Industry'),
  ('glass-daylight', 'Frosted Daylight', 'Light mode'), ('glass-gunmetal', 'Gunmetal Glass', 'Dark · Any space'), ('glass-gunmetal-ember', 'Gunmetal Ember', 'Dark · PvP'), ('liquid-glass', 'Liquid Glass', 'Any space'),
  ('liquid-gunmetal', 'Liquid Gunmetal', 'Dark'), ('liquid-daylight', 'Liquid Daylight', 'Light mode')]
tgrid2 = ''.join(f'<figure class="tcard"><img src="{jpg("theme-" + k, 900)}"><figcaption><b>{n}</b> · {t}</figcaption></figure>' for k, n, t in gthemes)
page(f"""<div class="kicker">Settings</div><h2>Glass and liquid glass themes</h2>
<p class="intro wide">See-through panels over a soft glow. Gunmetal is darker and almost colourless. Liquid glass is clearer, with rounded panels, pill buttons and bright curved edges.</p>
<div class="tgrid">{tgrid2}</div>""")
feature('Settings', 'Alerts, phone and in-game control', 'Choose which alerts show in Windows and which go to your phone, set the text size, and turn on in-game control if you want it.',
  ['Phone alerts through the ntfy app or a Discord webhook', 'Pick alert types, and send only while you’re away', 'Opt-in waypoints and in-game windows', 'One-time game data download for the planners'],
  [('37-settings', 'Settings, folded into sections'), ('38-settings-phone', 'Phone alerts')], 'two')

# ---------- About ----------
page(f"""
<div class="split"><div class="txt"><div class="kicker">About</div><h2>About EVE Toolkit</h2>
<p class="intro"><b>Mr Frank</b> builds and maintains EVE Toolkit. <b>Kayou Aldeshaar</b> came up with the idea and is the app’s beta tester.</p>
<h3 class="sub">Support development</h3>
<p>The app is free, and donating doesn’t unlock anything. If it saves you time or ISK, you can send <b>ISK or PLEX to Mr Frank</b>.</p>
<ul><li><b>ISK:</b> right-click Mr Frank in game and choose <i>Give Money</i>.</li><li><b>PLEX:</b> send Mr Frank a private item-exchange contract.</li></ul>
<h3 class="sub">Requests and bug reports</h3>
<p>Send an <b>EVE mail to Mr Frank</b>. The About page in the app copies your version details for the mail, or opens the mail window in game. For bugs, <i>Copy diagnostics</i> adds the recent error log, with tokens and webhook addresses removed.</p>
<h3 class="sub">Made with AI</h3>
<p>Built with help from Claude, Anthropic’s AI assistant. I looked deep into my soul and found I don’t give a shit whether you like AI. It’s very good at jobs like this one. Complaints by EVE mail, please. Your tears fuel me. <i>Mr Frank</i></p>
</div><div><figure class="hero about-shot"><img src="{jpg('39-about')}"><figcaption>About &amp; support</figcaption></figure><div class="gs"><h3 class="sub">Getting started</h3>
<ol><li>Unzip and run the portable .exe on Windows 10 or 11, or the AppImage on Linux.</li><li>Register a free application on developers.eveonline.com. The app shows you how.</li><li>Add your pilots with EVE SSO.</li><li>Download the game data once in Settings.</li></ol>
</div></div></div>
<div class="legal">EVE Online and the EVE logo are the registered trademarks of CCP hf. All rights are reserved worldwide. All other trademarks are the property of their respective owners. EVE Online, the EVE logo, EVE and all associated logos and designs are the intellectual property of CCP hf. EVE Toolkit is a third-party application and is not affiliated with or endorsed by CCP hf. Screenshots show demo data with fictional pilots.</div>""")

CSS = '''
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #0a0e13; }
body { font-family: "Segoe UI", "DejaVu Sans", "Liberation Sans", sans-serif; color: #d6e2ee; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 297mm; height: 210mm; padding: 14mm 15mm 16mm; position: relative; overflow: hidden; page-break-after: always;
  background: radial-gradient(1200px 600px at 100% 0%, rgba(79,209,197,.07), transparent 60%), #0a0e13; }
.page:last-child { page-break-after: auto; }
.page::after { content: "EVE TOOLKIT  ·  App overview"; position: absolute; left: 15mm; bottom: 7mm; font-size: 7.5pt; letter-spacing: .14em; color: #56677a; }
.page .pno { position: absolute; right: 15mm; bottom: 7mm; font-size: 7.5pt; color: #56677a; }
.kicker { font-size: 8pt; letter-spacing: .2em; text-transform: uppercase; color: #4fd1c5; margin-bottom: 2mm; }
h2 { font-size: 21pt; margin: 0 0 4mm; font-weight: 600; color: #eef4fa; line-height: 1.15; }
h3.sub { font-size: 10.5pt; color: #4fd1c5; margin: 5mm 0 1.5mm; font-weight: 600; letter-spacing: .02em; }
.intro { font-size: 10.5pt; line-height: 1.5; color: #b8c7d6; margin: 0 0 4mm; }
.intro.wide { max-width: 230mm; }
p { font-size: 9.5pt; line-height: 1.5; color: #b8c7d6; margin: 0 0 2mm; }
ul, ol { margin: 0; padding-left: 5mm; } li { font-size: 9.5pt; line-height: 1.5; color: #c8d5e2; margin-bottom: 1.6mm; }
ul li::marker { color: #4fd1c5; } ol li::marker { color: #4fd1c5; font-weight: 600; }
figure { margin: 0; } img { display: block; width: 100%; border-radius: 3mm; border: .3mm solid #2c3d4f; box-shadow: 0 3mm 9mm rgba(0,0,0,.55); }
figcaption { font-size: 7.5pt; color: #7d8fa3; margin-top: 1.8mm; letter-spacing: .03em; }
.split { display: grid; grid-template-columns: 74mm 1fr; gap: 9mm; align-items: center; height: 100%; }
.split .hero img { max-height: 158mm; object-fit: cover; object-position: top left; }
.split2 { display: grid; grid-template-columns: 70mm 1fr; gap: 8mm; align-items: center; height: 100%; }
.shots2 { display: grid; grid-template-rows: 1fr 1fr; gap: 5mm; }
.shots2 img { height: 78mm; object-fit: cover; object-position: top left; }
.cover-page { padding: 0; background: radial-gradient(900px 700px at 85% 20%, rgba(79,209,197,.18), transparent 60%), radial-gradient(700px 500px at 0% 100%, rgba(99,179,237,.10), transparent 60%), #070a0e; }
.cover { display: grid; grid-template-columns: 112mm 1fr; height: 100%; }
.cover-l { padding: 30mm 0 0 18mm; }
.logo { width: 20mm; height: 20mm; color: #4fd1c5; margin-bottom: 8mm; filter: drop-shadow(0 0 4mm rgba(79,209,197,.5)); }
h1 { font-size: 38pt; letter-spacing: .08em; margin: 0; font-weight: 600; color: #f2f7fb; }
.tag { font-size: 13pt; color: #9fb4c8; margin: 4mm 0 10mm; line-height: 1.4; max-width: 88mm; }
.cover-meta { font-size: 9.5pt; color: #7d8fa3; line-height: 1.7; }
.cover-meta b { color: #4fd1c5; }
.cover-pills { margin-top: 10mm; display: flex; flex-wrap: wrap; gap: 2.5mm; max-width: 92mm; }
.cover-pills span { font-size: 8pt; border: .3mm solid #2c5a58; color: #81e6d9; border-radius: 10mm; padding: 1.2mm 3.5mm; background: rgba(79,209,197,.06); }
.cover-shot { align-self: center; margin-right: -45mm; margin-left: -6mm; }
.cover-shot img { border: 0; border-radius: 0; box-shadow: none; }
.cover-page::after { content: ""; }
.ggrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin-top: 2mm; }
.gcard { border: .3mm solid #22303e; background: #121a23; border-radius: 3mm; padding: 4.5mm 5mm; }
.gcard h3 { margin: 0 0 2.5mm; font-size: 11pt; color: #4fd1c5; font-weight: 600; }
.gcard li { font-size: 8.8pt; margin-bottom: 1.2mm; }
.facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; margin-top: 7mm; }
.facts div { border-left: .8mm solid #4fd1c5; padding: 1mm 0 1mm 3.5mm; }
.facts b { display: block; font-size: 10pt; color: #eef4fa; margin-bottom: 1mm; } .facts span { font-size: 8.5pt; color: #9fb0c2; line-height: 1.45; display: block; }
.tgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin-top: 2mm; }
.tcard img { border-radius: 2mm; box-shadow: 0 2mm 5mm rgba(0,0,0,.5); height: 34mm; object-fit: cover; object-position: top left; }
.tcard figcaption { font-size: 7.5pt; margin-top: 1.2mm; } .tcard b { color: #d6e2ee; }
.legal { position: absolute; left: 15mm; right: 15mm; bottom: 12mm; font-size: 6.5pt; color: #56677a; line-height: 1.45; }
.page:last-child .split { height: 168mm; align-items: start; padding-top: 2mm; }
.about-shot img { max-height: 112mm !important; }
.gs { margin-top: 4mm; } .gs ol { columns: 2; column-gap: 8mm; } .gs li { break-inside: avoid; } .gs h3.sub { margin-top: 0; }
.legal { bottom: 13mm; }
.split.ov { grid-template-columns: 110mm 1fr; }
.ovshot { justify-self: center; } .ovshot img { height: 150mm; width: auto; }
'''
body = ''.join(p.replace('</section>', f'<div class="pno">{i + 1}</div></section>') if i else p for i, p in enumerate(pages))
open(os.path.join(OUT, 'overview.html'), 'w').write(f'<!doctype html><html><head><meta charset="utf-8"><title>EVE Toolkit: App overview</title><style>{CSS}</style></head><body>{body}</body></html>')
print(len(pages), 'pages')
