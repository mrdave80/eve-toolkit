# EVE Toolkit

A free Windows desktop app for EVE Online pilots, corporations and alliances. Skill training, industry, planets, market and trading, routes with gate camp checks, pilot intel and threat grades, wormhole mapping, an overlay for the game client, and corp tools, all in one place.

**[Download the latest version](https://github.com/mrdave80/eve-toolkit/releases/latest)** · **[App overview (PDF)](docs/EVE-Toolkit-App-Overview.pdf)** · Windows 10 or 11 (Linux AppImage too) · made by [Mr Frank](https://evewho.com/character/742485678)

![All pilots](docs/screenshots/pilots.jpg)

| | |
|---|---|
| ![Pilot intel](docs/screenshots/pilot-intel.jpg) | ![Route safety](docs/screenshots/route-safety.jpg) |
| ![Live map](docs/screenshots/live-map.jpg) | ![Trade profit](docs/screenshots/trade-profit.jpg) |
| ![Wormhole mapper](docs/screenshots/wormhole-mapper.jpg) | ![Wall of Shame](docs/screenshots/wall-of-shame.jpg) |
| ![Daily rewards](docs/screenshots/daily-rewards.jpg) | ![Search](docs/screenshots/search.jpg) |
| ![Pilot card popup](docs/screenshots/pilot-card.jpg) | ![Item card popup](docs/screenshots/item-card.jpg) |
| ![System card popup](docs/screenshots/system-card.jpg) | ![Fit checker](docs/screenshots/fit-checker.jpg) |
| ![Contract bargains](docs/screenshots/contract-bargains.jpg) | ![Settings](docs/screenshots/settings.jpg) |
| ![Liquid Glass theme](docs/screenshots/liquid-glass.jpg) | ![Gunmetal Glass theme](docs/screenshots/gunmetal-glass.jpg) |
| ![Price alerts](docs/screenshots/price-alerts.jpg) | ![One-click update](docs/screenshots/update.jpg) |
| ![Mail for all pilots](docs/screenshots/mail-all-pilots.jpg) | ![Asset finder](docs/screenshots/asset-finder.jpg) |
| ![Ore values](docs/screenshots/ore-values.jpg) | ![Copy EVE settings](docs/screenshots/copy-eve-settings.jpg) |
| ![What to build](docs/screenshots/what-to-build.jpg) | ![Agent finder](docs/screenshots/agent-finder.jpg) |
| ![D-scan roles and warnings](docs/screenshots/dscan.jpg) | ![PI watchdog](docs/screenshots/pi-watchdog.jpg) |
| ![Route planner places and favourites](docs/screenshots/route-places.jpg) | ![Daily goals](docs/screenshots/daily-rewards.jpg) |
| ![System Intel](docs/screenshots/system-intel.jpg) | ![Help and guides](docs/screenshots/help.jpg) |

Screenshots use demo data with made-up pilots.

## Install

Download from the [Releases page](https://github.com/mrdave80/eve-toolkit/releases/latest). Two builds, same app:

- **EVE-Toolkit-x.y.z-portable.exe**: a single file. Double-click to run, no install needed.
- **EVE-Toolkit-x.y.z-win-x64.zip**: unzip anywhere and run `EVE Toolkit.exe`. Starts a little faster than the portable build.

The app checks this page twice a day and shows a banner in the app when there's a new version.

**Upgrading from EVE Companion:** quit the old version from the tray first (right-click its icon, Quit). On first start, EVE Toolkit copies your settings, pilot logins, plans and game data from `%APPDATA%\EVE Companion`, so there's nothing to set up again. Delete the old folder once everything works.

The app isn't code-signed, so Windows SmartScreen may warn the first time. Click **More info → Run anyway**.

## One-time setup (about 3 minutes)

CCP requires every third-party app to have its own registration:

1. Go to https://developers.eveonline.com/applications and sign in.
2. **Create new application**. Give it any name.
3. Connection type: **Authentication & API Access**.
4. Tick every scope shown on the app's welcome screen. The easiest way is to select all the `esi-` character scopes.
5. Callback URL: `http://localhost:51515/callback`
6. Save, copy the **Client ID**, and paste it into the app. No secret key is needed (the app uses PKCE).
7. Click **Add pilot**, log in through your browser, and repeat for each character.

If port 51515 is already in use on your PC, change it in Settings and on the CCP app registration to match.

## What's tracked

| Area | Details |
|---|---|
| Boards (all pilots) | Training timeline, industry slots and running jobs, planetary extractor expiry |
| Character | Summary, corporation, roles and titles, faction warfare, employment history, standings, contacts, medals |
| Skills | Queue with live countdowns, training stats (SP/hour, projected SP, timeline), attributes and remaps, full skill list |
| Industry | Manufacturing, research (ME/TE), copying, invention, reactions, slot usage worked out from skills, corp jobs (needs the Factory Manager role), blueprints, planetary interaction, mining ledger, R&D agents |
| Finance | Wallet journal and transactions, market orders and history, contracts with items, loyalty points |
| Comms | Mail, notifications, calendar |
| Assets | Asset list valued at average market prices, clones and implants, jump fatigue, saved fittings |
| Combat | Recent kills and losses with zKillboard links |

Windows notifications (each can be switched off in Settings):

- skill queue empty, paused, or under 24 hours
- industry job ready
- all manufacturing slots idle
- extractor stopping within 2 hours

## Game data (first run)

Several tools need CCP's official static data export: blueprints, skill requirements, item names, stargates and wormhole types. Go to **Settings → Game data → Download game data**. It's a one-time download of about 100 MB from developers.eveonline.com. Use **Check for updates** after big EVE patches. If your network blocks the download, get the JSONL zip from developers.eveonline.com/static-data and use **Import zip…**.

## Skill planner (pilot → Skills → Skill Planner)

- Plans per pilot. Add any skill at a level, or any ship, module or item to pull in everything needed to use it. Prerequisites are added in the right order.
- Training times are calibrated to your live queue, so implants and boosters count.
- **Optimise remap** tries every attribute spread for the plan.
- **Import text** and **Copy for EVE** use "Skill Name 4" lines.
- **Can I fly…?** checks any item against all your pilots and imported audits.

## Tools

| Group | Tools |
|---|---|
| Market | Browser (live hub order book, 6-month price chart, all-hub comparison), Appraisal (paste inventory, contract, cargo scan, EFT or "10x Item"; contract-only items such as supercarriers and titans are valued at the higher of CCP's average and their material cost, and you can set your own price for them), My Orders (undercut / outbid check across all pilots), Hub Arbitrage, LP Store (ISK per LP) |
| Industry | Build Calculator (ME/TE, structure, rigs, security, live system cost index, job cost, build-vs-buy for components, ISK/hour), Invention (chance from skills, decryptor comparison, cost per unit), Reprocessing (yield from skills and facility, reprocess vs sell) |
| Navigation | Route Planner (shortest, safer or less secure, avoid lists, kills on route, through your wormhole maps and EVE-Scout's Thera/Turnur connections), Jump Planner (fewest jumps for capitals, black ops and jump freighters, fatigue estimate, systems in range), Universe (sov campaigns, incursions, faction warfare, Thera/Turnur) |
| Intel | Intel Watch (reads your EVE chat logs and alerts with sound and a Windows notification when hostiles are reported within N jumps of your pilots), Local & D-scan analysis (standings, zKill danger, ship counts, on-grid), Combat Log DPS meter |
| Finance | Net worth history (daily snapshots and chart), Income by source, ratting ticks |

## Wormhole mapper

- **Live auto-mapping:** pick the pilots to track. Their location is checked every 10 seconds. A wormhole jump adds the new system and the connection automatically. Stargate jumps are told apart from wormhole jumps and only mapped if you turn on *Map gate jumps*.
- **Systems:** wormhole class (C1–C6, Thera, C13, Drifter) or security, region, label and notes, home system, tracked pilots shown on the map, kills and NPC kills in the last hour, and jumps to Jita/Amarr/Dodixie/Rens/Hek from k-space exits.
- **Connections:** wormhole type, max ship size, mass (stable, destabilised, critical) and end of life, with age shown on the line. **Clear old** removes connections older than 24 hours or past end of life.
- **Signatures:** paste the probe scanner (Ctrl+A, Ctrl+C) to add, update or remove signatures. Typing a wormhole sig's destination creates the connection.
- Maps are shared with other officers through the corp workspace export and import.

## PI planner

- Production chain graph from planet types → raw → P1 → P2 → P3 → P4. Hover to trace a chain; click an item to make it a target or buy it instead of producing it.
- Set targets in units per day. The plan works out the rate for every intermediate, factories per tier, raw extraction, and which planet types to use (only the types you mark as available).
- Planet totals are compared with your colony slots across all pilots. **Fit to my planets** scales the plan to match.
- Economics per day: output value, bought inputs, export tax and transfer tax, net per planet and per month, and value at each tier.
- **Show my colonies** highlights what your pilots already extract and produce. Plans can be saved.

## Nearby planets (PI planner → Nearby planets)

Pick the planet types you need and where you are (type a system or click a pilot), and the closest systems with those planets come first. Choose **Any of these** or **All in one system**, set a jump limit, pick highsec, lowsec, nullsec or Pochven, and optionally use your alliance jump bridges. "Use my plan's types" fills in the planet types your current PI plan needs. Each result shows the jump count, how many of each chosen type it has, its other planets, and links to plan a route or open it on Dotlan.

Planet data needs a one-time game data refresh after updating to 1.9.0: Settings → Game data → Update.

## Corp / alliance mode

Corp mode works much like AllianceAuth, but runs from this app with no server to host.

1. On your CCP app registration, also tick the corp scopes listed on the Corporation page.
2. Click **Add director / FC** and log in with a character that holds the right in-game roles:
   - Director for members, assets and blueprints
   - Accountant for wallets and moon ledgers
   - Station Manager for structures and moons
3. Add a director from each corp you want covered. Use the selector at the top of the Corporation page to switch between them.

| Area | Details |
|---|---|
| Members | Member tracking (last login, location, ship), roles, titles, Discord links |
| Compliance | Who hasn't submitted an audit, stale audits, inactive members |
| Member audit | Members click **Export audit for corp** on their pilot's Summary and send you the file; you import it. Pilots logged into your own copy show live |
| Structures | Fuel, state and reinforce timers, services, structure notifications (one-click timers), POSes, customs offices |
| Moons | Extraction schedule, auto-fracture times, per-pilot moon mining ledger with value |
| Finance | Wallet divisions and journals, corp contracts, corp market orders |
| Industry | Corp jobs, assets by hangar (valued), corp blueprints |
| Ops | Op calendar, fleet participation tracking (the FC's app records the fleet every minute; no fleet links needed), timerboard |
| Killboard | Corp kills and losses with ISK efficiency |
| SRP | Requests from corp losses or pasted ESI kill links, payout rules (percentage, cap, fixed amounts by ship), approve/reject/paid, matched to tracked fleets |
| Recruitment | Applications with automatic background check, notes, status workflow, attached audits |
| Doctrines | Paste EFT fits, see Jita cost, skill requirements and which members (live + audits) can fly each fit |
| Moon Tax | Invoices from the moon mining ledger for a period and rate; payments matched against corp wallet donations |
| Buyback | Quotes at your % of Jita buy (per-category rates), checks outstanding buyback contracts |
| Discord | Webhook posts (ops, timers, structure attacks and low fuel, SRP, recruitment), op and timer reminders, bot role sync for linked members |

**Live sharing without a server:** under Discord → Share & Backup, choose a shared OneDrive, Dropbox or Google Drive folder. Every officer's app merges everyone's changes, deletions included, each minute. Members can be linked to their main on the Members page.

**Without a server**, corp records (ops, timers, fleets, SRP, applications, audits) live on the PC running the app. Officers share them with **Discord → Share & Backup → Export / Import**. Imports merge records, and the newest change wins. Background alerts and role sync run only while the app is open.

## Help & guides (sidebar → Help & guides, ? or F1)

Every tool has a guide: where to find it, what it's for, step-by-step instructions, tips and screenshots. Search the guides, or press **?** (or F1) on any page for its guide. **Walk me through it** opens the tool and shows each step in a small panel, highlighting the control to use. Guides also turn up in Ctrl+K search.

## System Intel (Tools → Intel → System Intel)

Search a system and pick 6, 12, 24 or 48 hours. You get player kills by hour, who is doing the killing (by alliance or corp) and in what ships, where the kills happen with gate and undock camps called out, the most active pilots, each kill with its attackers and a fit check, your own intel channel reports that mention the system, and ship kills, NPC kills and traffic in every system within two jumps over the last hour. Also opens from the **System intel** button on any system card.

**Battles** groups kills that happened close together into fights and splits them into the two sides, from who shot whom, with each side's pilots, ships lost, ISK lost and efficiency.

## Station trading (Tools → Market → Station Trading)

Scans every item at a trade hub for spreads worth station trading: buy with a buy order 0.01 over the best, resell 0.01 under the best sell, after sales tax and broker fee worked out from a pilot's Accounting and Broker Relations. Then checks each item's real daily volume and ranks them by what you'd make a day for the share of trades you expect to win. Items whose recent average price sits outside the spread are marked **check**, since one side may be a mistake or a scam order.

## Job splitter (Tools → Industry → Job Splitter)

Paste what you want built. The app works out the runs, splits them into jobs no longer than the limit you pick (one day suits a daily login), uses your blueprint copies first, and shares the jobs out over every pilot's free manufacturing and reaction slots. Copies stay with the pilot who owns them. You get each pilot's jobs, the ones waiting for a slot, every material with where you already have it, and a Multibuy list for the rest.

## Blueprint prices (Tools → Industry → Blueprint Prices)

Blueprints mostly sell on contracts. Search a blueprint (or what it makes) to see originals and copies on public contracts in the main trade regions, with ME and TE, copies priced per run, and the cheapest and median prices. Only contracts holding that one blueprint count.

## Ice and ore sites (Tools → Industry → Ice & Ore Sites)

CCP doesn't publish anomalies outside the game, so the app collects sightings: paste the probe scanner (or copy it in game with the clipboard watch on and it's added to your online pilot's system), and ice or ore sites mentioned with a system in your intel channels are added too. Turn on alerts for ice, ore sites or both within so many jumps of your pilots. A later scan crosses out sites that have gone, and the app remembers which systems have had ice. **Moon chunks** lists your corp's extractions with jumps from your nearest pilot, and directors get an alert an hour before each chunk arrives and when it's ready.

## Corporation fuel and leaderboard

**Corporation → Structures → Fuel** shows fuel blocks and magmatic gas in each structure's bay, the burn a day (from what's in the bay and when CCP says it runs out), how long it lasts, what's stored in hangars beside it, and how many days all your hangar reserves cover. **Corporation → Members → Leaderboard** ranks members by bounty and ESS tax paid to the corp (and what that means they earned), and by moon ore mined at corp drills.

## When Tranquility is down

During daily downtime or an outage, a banner says Tranquility is offline (or that EVE's servers can't be reached) and since when. Pages show what they last loaded instead of spinning. The app checks every 30 seconds and reloads the page when the server is back.

## What to Build (Tools → Industry)

Ranks the products of your own blueprints (the best ME/TE copy across your pilots) by profit per day. It prices each one with the Build Calculator's facility settings, takes off sales tax and broker fee, and caps what you'd sell at your chosen share of the hub's real daily sales, so a high-margin item nobody buys doesn't top the list. **Build ▸** opens the item in the Build Calculator. The calculator now has a **Shopping list**: it takes what your pilots already own (anywhere, or in the build system only) off the materials, checks you have the blueprint, and copies the rest for EVE's Multibuy window.

## Agent Finder (Tools → Navigation)

Find agents by level, division, kind (mission, research, storyline, faction warfare…), faction, name and distance from any system, highsec only if you like, with locator agents marked. Stations with lots of agents show as mission hubs. **Buy with LP** finds every NPC corporation whose LP store sells an item, what it costs in LP, ISK and other items, and the corporation's nearest station. The agent list needs a one-time game data update (Settings → Game data → Update).

## Gate camps (Tools → Navigation → Hunting & Ratting)

A third mode next to hunting grounds and safe ratting, for when you want a fight: it checks the busiest systems in range on zKillboard and lists active gate and undock camps, how many kills, how recent, who is camping and in what ships, with smartbombs and bubbles flagged.

## D-scan warnings (Tools → Intel → Local & D-scan)

Pasted d-scans are sorted by role and come with a **Worth knowing** list, most dangerous first: supercapitals, dreads, carriers, black ops, force and combat recons, heavy interdictors and interdictors, bombers, T3 cruisers, and objects like cynos, warp disruption bubbles, probes, mobile tractor units, depots and scan inhibitors, with how many are on grid.

## PI watchdog (Planets board and each pilot's Planets tab)

From each colony's last saved state, the app works out when its storage fills up and when factories run out of inputs, as well as when extractors stop. Colonies show their storage use and warnings; the Planets board lists colonies that need a visit within a day. Alerts go out a set number of hours ahead (Settings → Notifications), up to two reminders if nothing changes, and stop by themselves once you fix the colony. Snooze a colony for 12 hours from its card. ESI only updates a colony when you open it in game, so every projection starts from your last visit.

## Updating market orders (Tools → Market → My Orders)

**Update next order** copies a price that beats the best competing order (respecting EVE's four-significant-digit rule) and opens that item's market window in game. Find your order, Modify Order, paste, done. Tick the box to do the same with **Ctrl+Alt+N** while you're in game.

## Compare skills and streamer mode

**Tools → Pilots → Compare Skills** puts up to 10 pilots side by side, optionally only the skills where they differ, with **Skills CSV** and **Queues CSV** exports. The skill planner's **Remove trained** takes finished levels out of a plan. **Streamer mode** (the ◐ button in the top bar, or Ctrl+Shift+H) blurs pilot names, portraits, wallets and locations for streaming or screenshots. System cards now show **when it's busy**: kills by day of week and hour, with the busiest and quietest times in your time zone. Incursion payouts show as their own income source and on Ratting & Abyss with ISK per hour.

## Mail and calendar (sidebar → Mail)

Every pilot's EVE mail in one inbox, newest first, with a filter by pilot or unread and a search. Mail sent to several of your pilots shows once. Open a message to read it, then **Reply**, **Reply to all** or **Forward**. **New mail** writes from any pilot to pilots, corporations or alliances by name. In each pilot's Calendar tab you can **Accept**, answer **Maybe** or **Decline** invites. Sending, marking read and calendar answers need the opt-in Sending permissions (see In-game control and sending); without them you can still read everything and use **Open in game instead**.

## Asset finder (Tools → Industry → Asset Finder)

Search every pilot's hangars at once by item, group, station or system, and filter by pilot or value. Type a system in **Jumps from** to sort by distance; each place shows the pilot, system, security, region, m³ and value, and opens to list what's there. **Gather plan** lists everything that would have to move to bring the matches to one system, nearest first, with the volume and a hint at which ship can carry it. Places with no gate route (wormhole space) are listed separately. Player structures need the pilot to have docking access, otherwise their system shows as unknown.

## Ore values (Tools → Industry → Ore Values)

Which ore, moon ore, ice or gas earns most per cubic metre mined, at any hub, selling to buy or sell orders. Each row compares selling it raw, compressed (per m³ of raw ore) and reprocessed at the yield set in the Reprocessing tool, and marks the best. Add your mining rate in m³ per hour to see ISK per hour. Open a row for what one batch reprocesses into.

## Copy EVE settings (Tools → Client → Copy EVE Settings)

Copy one pilot's window layout, overview and chat setup to your other pilots, or one account's hotkeys, audio and graphics to your other accounts. The app finds EVE's settings profiles on this PC (including the Steam/Proton folder on Linux) and lists each pilot and account with when EVE last saved it. Accounts have no names in EVE's files, so you can label them. Every file that gets replaced is backed up first and **Undo this copy** puts it back. Close EVE before copying, or the client writes its own settings over the copy when it exits; the app warns you if it sees EVE running.

## Quiet hours and per-pilot alerts (Settings → Notifications and behaviour)

Set quiet hours (they can run past midnight) when no Windows, phone or spoken alerts go out, with exceptions for being attacked, intel near your pilots and structure attacks. Untick a pilot to silence their skill, industry, PI, market and other pilot alerts.

## Under-attack alert (Tools → Intel → Intel Watch)

Reads your combat logs and alerts the moment another player starts shooting one of your pilots (or anything, NPCs included, if you choose). It flashes the overlay red, beeps, can speak the alert, and sends a phone alert. One alert per pilot every 90 seconds.

## Backup and restore (Settings → Backup and restore)

Save everything (pilots, settings, maps, price alerts, trade records) to one file locked with a password you choose (AES-256). Restoring it on another PC brings your pilots back without logging in again. The current data is kept aside before a restore, just in case.

## Alerts and updates

Settings has toggles for war declarations, corp applications, contracts, orders filled or expired, undercuts and kill reports. Set an **update feed URL** (a small JSON file you host) and the app will tell you when a newer version is out.

## Updating

When a new version is out, a banner shows at the top of the app. **Update now** downloads it from this GitHub page, checks it against the release's SHA256SUMS.txt, then closes the app and opens it again on the new version. Your pilots, settings and data stay where they are. It works for both the portable exe and the unzipped folder. If the app can't write to the folder it runs from (Program Files, say), it says so and links to the download instead.

## Pilot Intel and threat grades (Tools → Intel)

- **Pilot Intel:** look up any pilot by name. The profile shows their corp and alliance, age, security status, corp history and bio (from ESI), plus kills, losses, ships flown, active hours and recent kills and losses (from zKillboard), with EveWho and zKillboard links.
- **Threat grade:** a score from 0 to 100, graded Minimal, Low, Moderate, High or Extreme, with the reasons shown. It's broken down by highsec, lowsec, nullsec, wormholes and Pochven, and includes a separate highsec gank-risk score.
  - **Flags:** Highsec ganker (loses ships to CONCORD), Hotdropper, Cyno pilot, Black Ops, Capital or Supercapital pilot, Bubbler, Cloaky hunter, Solo hunter, Active now, Outlaw, New character, and Red or Blue to you.
  - Blues and pilots you tag as friendly are always graded Minimal.
- **Watchlist:** tag pilots as Hostile, Ganker, Friendly or Note only, with a note. Tagged hostiles and gankers always alert.
- **Local & D-scan:** **Grade pilots** grades everyone in a pasted Local list, up to 80 pilots, and sorts the list by threat.
- **Intel Watch:**
  - Pilots named in nearby intel reports are graded, and the grade goes into the alert.
  - People who speak in Local are graded, with an alert at your chosen threat level. EVE's logs record what people say in Local, not who's in it.
  - **Kill-spike watch** checks CCP's hourly kill counts every 5 minutes. It alerts on sudden kills within N jumps of your pilots, flagged as possible ganking in highsec.

## Route safety (Tools → Navigation → Route Planner)

Type in **From** or **To** and pick from the list: systems, NPC stations and your own structures, each showing how many of your items are there. Press ☆ to save a place as a favourite; favourites sit above the form, click one to route there or ⇤ to start from it. ⌂ lists every station in a system with your items at each, and ⇅ swaps start and destination. When the destination is a station, **Send route to EVE** and **Set destination only** point the autopilot at the station itself. Station names are read once from ESI after a game data update.

Each route is checked against recent zKillboard kills. The check flags:
- **Gate camps**: 2 or more kills at the same gate, with a badge when it's a gate you'll jump through.
- **Undock camps.**
- **Smartbomb camps**: pods and shuttles dying to battleships.
- **Bubbles**, in nullsec and wormhole space only.
- **Highsec suicide ganking**: CONCORD killing gankers, or gank hulls ganging up on haulers and freighters.

It names the corps and alliances involved and the ships they use, and grades the worst attackers. **Avoid and re-route** adds the hot systems to your avoid list and plans again. **Look back** is either the last hour (fast: only systems with kills are checked) or the last 2 to 3 hours (every system on the route is checked).

zKillboard asks for about one request a second, so a full check of a long route takes a little while. Results are estimates from public data, and a camp can start after you check, so re-check before you undock.

## Wall of Shame (Tools → Intel)

The most embarrassing recent losses from zKillboard, judged on the fit in each killmail. Choose the last 24 hours or 7 days, everyone or only your corp and alliance, and an area of space. Each loss gets tags and a shame score:
- **Flew it naked** or **Half-fitted:** empty slots compared with the ship's slot count
- **No tank** on a combat ship, and **Shield and armor? Pick one** for mixed tanks
- **Rainbow weapons:** more than one weapon system
- **All the bling, none of the skill:** faction, deadspace or officer modules, killed solo
- **Autopilot special:** a hauler with over 1 billion ISK in cargo, ganked
- **Lost to the rats:** over 300m ISK killed by NPCs
- **Self-destructed**, **Awoxed**, **Expensive brain** (pods over 1b) and **Big oof** (over 10b)
- **David and Goliath:** a big ship solo'd by a frigate or destroyer

The page also shows **Biggest oofs**, **Repeat offenders** and **Feeder corps & alliances**, with **Copy for Discord** on each kill. The first load reads up to 150 killmails, so it takes up to a minute. Results are kept for 30 minutes.

## Overlay (sidebar → Overlay, or Ctrl+Shift+O)

A small window that stays on top of the EVE client. It shows:
- your pilot's system with its kills in the last hour
- people graded in Local
- the next jumps of your planned route, with camp and gank flags
- kill spikes nearby
- recent intel

The overlay uses the same theme as the main window and changes with it, including location-based switching. Glass and liquid glass themes stay see-through over the game.

![Overlay in Liquid Glass](docs/screenshots/overlay-liquid.jpg)

**Ctrl+Shift+L** locks it so clicks pass through to EVE. Use EVE in windowed or fixed-window mode, because exclusive fullscreen hides other windows.

## Live map (sidebar → Live map)

A map of any region, laid out from CCP's system positions. The heat layer shows ship and pod kills, NPC kills (ratting) or jumps (traffic) from CCP's hourly stats, or sov owners. It also shows:
- pulsing rings on systems named in your intel channels
- your pilots
- your jump bridges
- wormholes from your maps

Click a system for its stats and quick actions: route from or to, hunting or ratting nearby, set destination.

## Hunting & ratting (Tools → Navigation)

- **Hunting grounds:** nearby systems where NPCs are dying but players aren't. Dead ends and quiet systems rank higher.
- **Safe ratting:** quiet systems with no player kills in the last hour and little traffic. Dead ends rank higher.

Both use CCP's hourly stats. **Check 3h** asks zKillboard about the last 3 hours.

## Jump bridges (Route Planner → Manage)

Paste your alliance's Ansiblex list. Lines like `1DQ1-A » 8QT-H4 - Bridge`, `Y-2ANO <-> PR-8CN` or two names separated by a tab all work. Tick **Use our jump bridges** to route through them. The live map draws them as gold dashed lines.

## Wormhole residents (Tools → Intel, or "Who lives here?" in the wormhole mapper)

Reads zKillboard's stats and the last 50 kills in a J-system, and labels each group as one of:
- **Likely resident:** shoots and dies there over several days
- **Regular hunter**
- **Dies here often**
- **Possibly evicted:** lost structures, nothing since
- **Eviction or roam**
- **Visitor**

It also shows active hours by time zone, the last kill, and structures lost.

## Ratting & Abyss ISK per hour (Tools → Finance)

- **Ratting:** sessions built from bounty ticks (a gap of over 30 minutes ends a session), with ESS payouts added. Shows ISK per hour per session, the best systems, and totals.
- **Abyss:** turn on automatic timing and the app times each visit to Abyssal deadspace from your pilots' locations. After a run, paste the cargo to value the loot. The filament cost (Jita sell) is subtracted, and you get ISK per hour per filament type. It flags lost ships.

## Daily rewards (sidebar → Daily rewards)

EVE doesn't share login rewards or Daily Goals through ESI, so the app can't see what's waiting to be claimed. It covers the rest:

- **Reset and server alerts.** An alert when Tranquility comes back after downtime (11:00 EVE time) and Daily Goals have reset, and another if downtime runs long.
- **Daily Goals.** Every pilot gets the same goals each day, so pick today's set once from the list (the in-game Opportunities window shows them). Click a pilot to see each goal with a tip on doing it quickly, and tick off the ones they've done. Two goals ticked marks the pilot done for the day; you can also tick **Done** by hand. A reminder lists any pilot you haven't ticked a set number of hours before the next reset.
- **Monthly track.** Each tick counts as one of the 12 steps. The app warns when a pilot is running out of days to finish the month. It assumes the track runs by calendar month.
- **EVE news.** The app reads CCP's news feed every 30 minutes and alerts on new login campaigns, skill point events, free items, events and (if you want) sales, with the end date where the article gives one.

Phone alerts for all of these are under the "Daily reset, login rewards, EVE news and server status" category.

## Price alerts (Tools → Market → Price Alerts)

Keep a watchlist of items with a price to alert below, above, or both, at any of the five trade hubs, on the lowest sell order or the highest buy order. Prices are checked every 15 minutes while the app runs. When an item crosses your price you get a Windows alert, and a phone alert if you've set those up. Each alert fires once and is ready again once the price moves back past your line. Open a row for its price history and the lowest and highest seen. You can also set an alert from any item card or the item database.

## Trade profit (Tools → Market → Trade Profit)

Real profit from your market trading. Each sale is matched to the oldest buys of the same item (first in, first out), or costed at the weighted average of what you hold if you prefer, and sales tax is taken from the wallet journal line for that sale. Broker fees can't be tied to an item, so they come off the total. Shows profit after fees, profit per day, sales, stock still on hand, and per item: margin, average time held, and what's left in stock. Turn on matching across pilots if you buy on one character and sell on another. Profit is split into **station trading** (bought and sold in the same station) and **hauling**. Leave single buys, items or whole stations out, for example a station you only use to move stock between your own pilots.

ESI only shares about 30 days of transactions, so the app keeps its own record on your PC and adds to it every six hours. Sales with no matching buy in that record (bought before tracking started, looted, built) are listed separately and left out of profit.

## Fit checker (Tools → Fitting → Fit Checker)

Paste a fit in EFT format (the in-game "Copy to clipboard" or Pyfa's EFT export) to see:

- The slot layout with every module, charge, drone and cargo item, and what it all costs at Jita.
- CPU, powergrid and calibration used against what the ship has with all skills at V, and the same for each of your pilots with their real skills. Too many modules for the slots or hardpoints is flagged.
- Which pilots can fly it, and how long the rest need to train.
- **Damage, tank and capacitor** with everything fitted: DPS (split into weapons and drones), volley, EHP and resists for each layer, active and passive tank, capacitor stability or how long it lasts (with and without the prop module), speed, align time, signature and targeting. Pick all skills at V or any of your pilots to see the fit with their real skills.
- **Open in Pyfa** copies the fit so Pyfa can import it from the clipboard, for deeper theorycrafting.

The stats come from [EVEShip.fit](https://eveship.fit)'s open-source dogma engine, the same one their website uses. The first check downloads its copy of the game data (about 10 MB, from the npm registry, checked against its published checksum). It looks for newer data every few days.

Fitting uses CPU Management, Power Grid Management, Weapon Upgrades, Advanced Weapon Upgrades, Energy Grid Upgrades, Electronics Upgrades and Shield Upgrades, plus co-processors and similar modules. Ship bonuses that cut fitting costs aren't counted, so a fit can show as slightly over when it actually fits. Doctrine fits on the Corporation → Doctrines page have a **Check** button that opens them here.

## Contract bargains (Tools → Market → Contract Bargains)

Scans public item-exchange contracts in a region for anything priced well under what its items sell for in Jita. Set a minimum profit and discount, a maximum price and highsec only. Contract contents never change, so the app keeps them on your PC: the first scan of a busy region reads up to 400 new contracts (adjustable) and each later scan only reads new ones. Blueprint copies are valued at zero. Contracts more than 70% under value, or that ask for items in return, are marked "check carefully" because those are common scams.

## Item database (Tools → Market → Item Database)

Search any item, ship or skill to see its stats, required skills, hub prices, what it's built from (with material cost), what it reprocesses into and what it's used to build. "Who can use it?" checks your pilots' skills. Item stats need a one-time game data refresh after updating to 1.9.0: Settings → Game data → Update.

## Moon scan (Tools → Industry → Moon Scan)

Paste the Survey Scan Results window (select all, copy) for one moon or many. Each moon gets its best ore rating (R4 to R64), ISK per m³, value per extraction and per 30 days. Each ore is valued at the better of selling it raw or refining it at your yield (85% by default), at Jita sell or buy. The drill rate is 20,000 m³ an hour, so a 7-day extraction is about 3.4m m³.

## Sharing wormhole maps (Wormhole mapper → ⇄ Share)

Send a map to corp or alliance mates who also use EVE Toolkit:

- **Copy as text** puts the whole map on the clipboard as a block starting with `EVETK-WH1:`, ready to paste into Discord or an EVE mail.
- **Save to file** writes a `.evewh.json` file, better for big chains.

Systems, connections, signatures, labels and notes are included. Pilot tracking isn't.

To bring one in, use **Paste from clipboard** or **Open file**, either **as a new map** or **merged into** one of yours. Merging adds the systems, connections and signatures you don't have, takes newer connection details (mass, end of life), and keeps your own labels and notes.

The same buttons import chains from other mappers: a map exported from **Pathfinder**, **Wanderer** or **Nexum**, or a plain list of systems, one chain per line (`Home -> J123456 -> J234567`). Systems, links, mass, end of life and ship size come across where the other tool has them.

## Rolling wormholes (Wormhole mapper → Rolling)

Pick the wormhole type (or enter its mass), how it looks now and the ships you roll with. The planner lists round trips, hot or cold each way, so every jump out stays under the lightest the hole could be (mass varies by ±10%) and the hole closes on a jump back. It notes when the hole should start to look reduced or critical; set what you see and the plan updates.

## Signatures

Paste the probe scanner into a system's Signatures box. Signatures no longer in your scanner are crossed out rather than deleted, and **Delete them** clears them all at once (or tick "Delete missing straight away").

## Wormhole system info (Wormhole mapper and Wormhole Residents)

Selecting a J-space system in the mapper, or checking one in Wormhole Residents, shows its class, statics (with where each leads, lifetime and mass) and system effect with a short summary. Statics aren't in CCP's game data, so they come from the Pathfinder project's player-recorded list (MIT licence, bundled with the app).

## Skill farm (Tools → Finance → Skill Farm)

Profit per 30 days for each pilot if you extract their SP into Large Skill Injectors. SP per day comes from the skill each pilot is training now, so attributes and implants count. Set each pilot as paid by Omega, by an MCT slot, already paid, or not farming. Omega and MCT costs default to the New Eden Store prices without discounts (500 and 350 PLEX) and can be changed. Prices are Jita, with PLEX from CCP's global PLEX market. The page also shows how many extractors each pilot can use today without dropping below 5m SP.

## Character value (Tools → Finance → Character Value)

For each pilot: skill points, skills at V, extract value (every skill point above 5m pulled with extractors and the injectors sold, roughly the lowest sensible price) and the cost to reach the same SP with injectors (roughly the highest, since injectors give less SP the more a pilot has). Also lists skills buyers pay more for, such as capitals, Jump Drive Calibration V and Cyno V. Character Bazaar sales tend to land between the two figures.

## Insurance (Tools → Finance → Insurance)

CCP's insurance cost and payout for the ship each pilot is in, and for any ship names you add, against the Jita hull price. Net if lost is the payout minus the policy cost, and Covers is that net as a share of the hull price.

## Timer alerts (Settings → Behaviour)

Alerts when a pilot's jump clone is ready, when jump fatigue clears, and when an incursion spawns within a set number of jumps of any pilot (10 by default). Phone alerts for these are under "Jump clone ready, jump fatigue cleared, incursions nearby".

## Spoken alerts (Settings → Spoken alerts)

Windows reads out intel reports near your pilots, threats in Local, kill spikes and finished Abyss runs. For example: "Hostile, 2 jumps, Tama. Extreme threat Ben Dover". You can pick the voice, speed and volume.

## Clipboard watcher (Tools → Intel → Local & D-scan)

This is **off until you turn it on**: tick *Auto-analyse when I copy Local or d-scan in EVE*. While it's on, a **📋 Clipboard watch on** badge shows in the sidebar.

In game, click the Local member list or the d-scan results, press **Ctrl+A** then **Ctrl+C**. The app recognises the list, analyses it and grades the pilots. When the app isn't the active window, it also sends a notification, for example "Local: 23 pilots, 4 red, 2 high threat · 1 ganker". Anything else you copy is ignored, and nothing copied is stored.

## Recruit spy check (Corporation → Recruitment, or any Pilot Intel profile)

Grades an applicant as **Looks OK**, **Review** or **High risk**, and lists the reasons:
- corp hopping and short stays
- character age
- current or past corps or alliances you're red to
- **awox kills**
- kills on your own corp or alliance, or on your blues
- your watchlist tags

**Spy-check open applications** checks everyone at once. Results are saved on the application, so they sync to your other officers.

## Courier contracts (Tools → Navigation → Courier Contracts)

Public courier contracts in up to 4 regions, ranked by **ISK per jump**, counting the jumps to the pickup plus the delivery route. You can filter by volume, collateral, reward, pickup distance and highsec-only routes.

Contracts are flagged when the route leaves highsec, the collateral is high compared with the reward, or the delivery is to a player structure. **Check route** runs the gate-camp and gank check on the delivery route. The issuer's name opens their Pilot Intel profile.

## Phone alerts (Settings → Phone alerts)

Forward chosen alert types to your phone through **ntfy**, a free push-notification app, or a **Discord webhook** to a private channel. The types are skill queue, industry, PI, market, intel, structures, ops, wormholes, corp and app updates. You can choose to send only while the app isn't the active window. **Send a test** checks the setup.

## In-game control and sending (Settings → In-game control and sending)

This is opt-in. Once on, it gives you:
- **Send route to EVE**: sets every waypoint, stopping before any wormhole or Thera hop.
- **Set destination only.**
- **Open in game** for courier contracts, and **Show info in game** for pilots.
- **Open mail in game** on the About page, pre-filled to Mr Frank with your version details.

**Sending** is a separate opt-in. It lets the app send mail you write, mark mail read or unread, answer calendar invites and **Save to game** a fit from the fit checker into the pilot's in-game fittings. It needs `esi-mail.send_mail.v1`, `esi-mail.organize_mail.v1`, `esi-calendar.respond_calendar_events.v1` and `esi-fittings.write_fittings.v1` ticked on your app registration, then a re-authorise. The other way round, saved in-game fittings, Wall of Shame losses and kills have a **Check fit** button that opens them in the fit checker.

To set it up, add the scopes `esi-ui.write_waypoint.v1` and `esi-ui.open_window.v1` to your app on developers.eveonline.com, turn the option on, then re-authorise your pilots. The pilot needs to be logged in to EVE. If logins fail with "invalid scope", the app registration is missing the two scopes.

## Themes (Settings → Appearance)

Twenty-one themes, applied instantly:

| Theme | Suits |
|---|---|
| Capsuleer | Default, any space |
| Concord Highsec | Highsec, missions, new pilots |
| Imperial Gold | Highsec PvE, incursions |
| State Steel | Trading, industry |
| Federation Verdant | Exploration, drone pilots |
| Rust Republic | Lowsec, faction warfare, small gang |
| Sov Bloc | Nullsec, fleets, structure timers |
| J-Space Void | Wormholes |
| Abyssal Crimson | PvP, Abyss, Pochven |
| Ore Hauler | Mining, industry, PI |
| Station Lights | Light mode |
| Nebula Glass | Glass, any space |
| Ice Field Glass | Glass, highsec, trading |
| Drifter Glass | Glass, wormholes, PvP |
| Solar Glass | Glass, mining, industry |
| Frosted Daylight | Glass, light mode |
| Gunmetal Glass | Dark glass, any space |
| Gunmetal Ember | Dark glass, PvP |
| Liquid Glass | Liquid glass, any space |
| Liquid Gunmetal | Liquid glass, dark |
| Liquid Daylight | Liquid glass, light mode |

The glass themes use frosted, see-through panels over a soft glow. Gunmetal is darker and almost colourless. Liquid glass is clearer, with rounded panels, pill buttons and bright curved edges that catch the light. On older or low-power PCs they can use a little more graphics power than the solid themes.

You can also set a custom highlight colour (your corp colours, say) and a text size. **Match the theme to where I'm flying** switches theme automatically for highsec, lowsec, nullsec, wormhole space and Pochven, based on your pilot's location. It checks every 2 minutes.

## About and support

EVE Toolkit is made by **Mr Frank** (https://evewho.com/character/742485678). Inspiration and beta testing by **Kayou Aldeshaar** (https://evewho.com/character/91378854), whose idea the app was. It's free, and nothing is locked behind a donation. ISK or PLEX donations to Mr Frank in game are welcome. Send feature requests and bug reports to Mr Frank by EVE mail. **About & support** in the app has a button that copies your version details for the mail.

### Made with AI

EVE Toolkit was built with help from Claude, Anthropic's AI assistant. I looked deep into my soul and found I don't give a shit whether you like AI. It's very good at jobs like this one. If you want to complain, send me an EVE mail. Your tears fuel me.

*Mr Frank*

### Diagnostics for bug reports

The app keeps a log of errors at `%APPDATA%\EVE Toolkit\logs\eve-toolkit.log` (up to 1 MB, then it starts a new one and keeps the previous one as `.1`). On **About & support**:

- **Copy diagnostics** copies your version, Windows version, game data build, pilot count, which features are on and the last 60 log lines. Paste it into your EVE mail.
- **Open log folder** opens the folder so you can attach the full log.
- **View** shows the report in the app first.

Tokens, login codes, webhook addresses and ntfy topics are removed before anything is logged. Your client ID is reported only as set or not set.

## Quick looks and details on demand

Click a pilot, item or system name almost anywhere in the app and a card pops up over the page, so you don't lose your place:

- **Pilot card**: corp and alliance, security status, age, threat grade and the reasons for it, kills and losses, ships they fly and recent activity. **Open full profile** goes to Pilot Intel.
- **Item card**: click any item icon for hub prices, build cost, required skills, key stats and who among your pilots can use it. **Open in item database** shows everything.
- **System card**: security, region, sovereignty, kills and jumps in the last hour, planets, gates out, and wormhole class, effect and statics. Buttons plot a route, open the live map, set your destination or open zKillboard and Dotlan.
- **Route**: "Route" links on the live map, hunting list and Nearby planets plot the route in a popup with gate camp and gank warnings.
- **Who lives here?** in the wormhole mapper and **Check** on doctrine fits also open as popups.

Rows marked ▸ open to show more:

| Where | What opens |
|---|---|
| Trade Profit | Each sale, the buys it was matched to, tax and profit, and the split between pilots |
| Contract Bargains | Every item in the contract with Jita sell and buy values, anything they want in return, and Copy item list |
| Wall of Shame | Why it's here: each tag with the evidence behind it, and the full fit and cargo, with dropped items marked |
| Route Planner | What died in a system on your route in the last hour, who did it, and the hazards |
| Fit checker | The skills each pilot is missing, with Copy as skill plan |
| Courier Contracts | The route system by system, with any camps or ganks found by Check route |
| Ratting | Every bounty tick in the session, with a chart |
| Abyssal runs | The loot from each run and what each item was worth |
| Pilot Intel kills and losses | ISK breakdown, attacker ships, and the pilots involved by damage |

Settings are folded into sections, so you only open the one you need. Open all and Close all are at the top, and the app remembers which ones you left open.

## Finding things

Press **Ctrl+K**, or click **Search** in the top bar, to find any tool, page, pilot, item or wormhole. Type a word like "moon", "insurance", "Ishtar" or a J-sig such as J123450 and press Enter. The All pilots page also has a short getting-started checklist until you hide it.

## Game data updates

EVE Toolkit uses CCP's game data for planners, routes, the item database, the fit checker and more. A few seconds after it starts, the app checks that data and offers to download or update it if:

- it hasn't been downloaded yet,
- a new version of the app needs parts of it your copy doesn't have (for example, planets for Nearby planets), or
- CCP has released newer game data after a patch. **Skip this update** stops the reminder until CCP releases the next one.

Updating takes a few minutes and carries on in the background if you close the window. If CCP's site can't be reached, the app doesn't ask. You can also update any time from **Settings → Game data**.

## Where your data is kept

Everything lives in `%APPDATA%\EVE Toolkit\`:

- `companion-data.json`: settings, pilots (tokens encrypted) and other small data.
- `data\`: the larger records, one file each: trade ledger, cached contract contents, net worth history, Abyss runs, daily ticks, timers and the name cache. Keeping them separate means saving settings stays quick however much history builds up.
- `sde\`: the downloaded game data.
- `logs\`: the error log used by Copy diagnostics.

To move to another PC, use Settings → Backup and restore, which keeps your pilots logged in. Copying the folder by hand also works, but refresh tokens only decrypt for the same Windows user, so on a new PC you'd need to log each pilot in again.

## Privacy and security

- Read-only by default. The app can't move ISK or items. Setting waypoints, opening windows in game, sending mail, answering invites and saving fits are opt-in and need extra scopes you grant per pilot.
- About & support → **Privacy and permissions** lists what each permission is for and every outside service the app talks to.
- Refresh tokens are encrypted with Windows DPAPI and stored in `%APPDATA%\EVE Toolkit\companion-data.json`.
- The app talks to CCP (`login.eveonline.com`, `esi.evetech.net`, `images.evetech.net`), zKillboard and EVE-Scout for public data, and ntfy.sh or Discord only if you turn on phone alerts or Discord posts.

## Building from source

Needs Node.js 20 or later.

```
npm install
npm start            # run in development
npm run dist:win     # build the portable .exe and the zip into dist/
npm run dist:linux   # build the Linux AppImage
```

---
EVE Online and the EVE logo are the registered trademarks of CCP hf. All rights are reserved worldwide. This application is not affiliated with or endorsed by CCP hf.

## Licence

Copyright © 2026 Mr Frank.

EVE Toolkit is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. It is distributed in the hope that it will be useful, but without any warranty; without even the implied warranty of merchantability or fitness for a particular purpose. See [LICENSE](LICENSE) for the full terms.

In short: you can use, copy, change and share the app, but if you share a changed version you have to share its source under the same licence.

The licence covers this project's own code. The bundled wormhole statics list (`src/data/wh-statics.json`) comes from the Pathfinder project under the MIT licence, kept in `src/data/wh-statics.LICENSE.txt`. Fit stats use [EVEShip.fit's dogma engine](https://github.com/EVEShipFit/dogma-engine) (`@eveshipfit/dogma-engine`, MIT licence, its licence ships with it) and its game data package `@eveshipfit/sde`. EVE Online game data, artwork and names belong to CCP hf. and aren't covered by this licence; the app downloads game data from CCP at runtime.

