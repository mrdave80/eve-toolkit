# Changelog

## 1.14.0

- Tabs: keep several pages open like a browser. Ctrl+click or middle-click opens a page in a new tab, ⚲ pins a tab so it stays and comes back when the app restarts. Ctrl+T, Ctrl+W, Ctrl+Tab and Ctrl+1–9 work as in a browser.
- Belt Tracker (Tools → Industry): paste the survey scanner every few minutes to see what's left, how fast it's going, and when the belt and each ore run out. The clipboard watch adds surveys by itself.
- Where to Mine (Tools → Industry): pick a mineral such as Zydrine for every ore and ice that refines into it, best per m³ first, where it usually spawns, the nearest such system and where your pilots have mined it.
- Where to Build (Tools → Industry): nearby systems ranked by CCP's cost index, with NPC stations and the job fee for an item.
- Build calculator: build or sell (versus selling the materials, and component by component) and blueprint payback in runs and days.
- Mining build planner: works out the true fewest m³ to mine, or the cheapest compressed ore to buy, and can leave out ore grades.
- Wormholes: kills in your chain (zKillboard, every 5 minutes, with alerts); a hole collapse in the game log asks which connection and removes it and what's cut off, with undo; the overlay shows the chain around you; probe scans from German, French and Russian clients are read.
- Wars (Tools → Intel): wars involving your corporations and alliances, whether they're on yet, and kills on each side.
- Haul Planner (Tools → Navigation): packs a hangar or pasted list into trips for your ship, most ISK per m³ first, with a value warning and an optional per-trip cap.
- Wallet history is kept past CCP's 30 days, with CSV export; Income and Ratting reach back up to a year.
- Contracts → Search all history: every contract your pilots have had, kept past 30 days, searchable by title, people, places and items.
- Skills to Buy (Tools → Pilots): skill books your plans need that aren't injected, with prices, books you already own, and a Multibuy list.
- Mutaplasmids (Tools → Fitting): every mutaplasmid for a module with best and worst rolls, and how good your roll is. Needs a game data update.
- Fleet tracker: doctrine check of who's in a doctrine hull.
- Market: ships show how many are destroyed each month on zKillboard.
- Alerts per pilot: set each pilot to all alerts, only while logged in to EVE, or no alerts (Settings → Notifications and behaviour, or **Alert types** under the bell, or **mute this pilot** on any alert). Alts you rarely play no longer pop up. Their alerts still go in the inbox, marked, and muted pilots are left out of daily goal reminders and Needs attention. Corp alerts such as structure attacks always come through.
- First-run setup asks what you play (mining, industry, trading, PI, PvE, exploration, wormholes, PvP, corp, alts) and hides the tool groups you don't use. Change it any time in Settings. Ctrl + / Ctrl − / Ctrl 0 (or Ctrl + mouse wheel) zooms the whole window, also in Settings.
- Adding a pilot asks what EVE Toolkit may see: skills, wallet, location, assets, industry, planets and notifications always, with market and contracts, fittings, LP and agents, mail and calendar, contacts and standings, and corp jobs as tick boxes, and corp access for directors and FCs. Pilots added before keep everything they granted.
- Pilot groups: put pilots in groups such as Main, Alt or Farm (Settings → Notifications and behaviour). Buttons above the pilot list filter the sidebar, the dashboard and the training, industry and planets boards, and **Set a whole group** changes alerts for every pilot in it.
- 50+ pilots: the dashboard and boards load six pilots at a time and redraw at most four times a second, and the background check runs four pilots at once and skips the extra checks for pilots with alerts off. The pilot list no longer disappears on short screens.
- Likely fits for reds: the pilot card and each threat in Local (**Show what they usually fly and how**) list the hulls a pilot flies on kills and, from their last loss in each, the fit: weapons, tank, point or scram, webs, neuts, cloak, cyno, bubble. One click opens the fit in the Fit Checker.
- Exploration Loot (Tools → Finance): paste the loot after each relic or data site for ISK per site, per site type and per hour, runs, and which loot is paying. Valued at Jita buy or sell.
- Fit share codes: **Share code for FC** on any fit makes a short code to paste in fleet chat. In the fleet tracker the FC pastes the chat into **Check fit codes** and sees who is on the doctrine fit, who is missing modules and what they fitted instead.
- Haul Planner: pick any ship, including the Upwell haulers, DSTs and the Orca, for its cargo and specialised holds from the game data.
- Fit Checker: hit chance and application. Turret hit chance from tracking, optimal, falloff, range, transversal and target signature, with a range by transversal table; missile damage applied from explosion radius and velocity. **This ship as target** uses the fit's own signature and speed.
- Blueprints: **Export for collateral** saves the blueprints shown (search by name or location) with values and a total, for courier collateral or insurance.
- Phone alerts: a daily digest at a time you pick, with everything under Needs attention, how many pilots are training and the wallet total, by ntfy or Discord. **Send one now** to try it.
- A pilot that doesn't share something (mail, contracts, orders, contacts and so on) is skipped for it without asking CCP, so it can't eat into ESI's error limit, and the page says how to add it. **Re-authorise** opens the same choices, ticked as the pilot has them now.
- Closing the "what do you play" question without choosing shows every tool and doesn't ask again.
- Fixed: skill queue alerts (empty, paused, ending) ignored quiet hours, pilot muting and alert types. They now follow them like every other alert, under their own **Skill queues** type.
- Fixed: muting a pilot only worked for alerts whose title started with the pilot's name.

## 1.13.0

- Fixed: one-click update of the folder (win-x64 zip) version failed with "Invalid package …app.asar" while unpacking. Updating from 1.12.0 or earlier still needs a manual download this one time, because the old updater does the unpacking.
- Pilot → Industry → Mining: pick 6, 12, 24 or 48 hours, a week, a month or since your last payment. A moon tax calculator works out what you owe the corp that owns the refinery: set the rate, choose refined value (at your refinery's yield), Jita buy or sell, or CCP's average, and choose which ores are taxed. Payments to the holding corp are found in your wallet, and **Copy for corp mail** gives a ready-to-send line. CCP's ledger only records days, so the app keeps its own timed log every 15 minutes for the hour periods.
- Mining: click an ore to see the minerals it refines into, and **Minerals from everything mined** totals them for the period at your refining yield after the refinery's tax (set both on the page).
- Mining → **Plan a build with it**: pick one of your blueprints (original or copy, with its ME) or anything buildable, and how many. It lists every mineral the whole build needs (components too, if you like), what your mining already covers, and the ore to mine for the rest, plus anything that doesn't come from ore. It warns when a copy hasn't enough runs.
- Needs attention on the All pilots page: expired logins, empty skill queues, finished jobs, stopped PI, unread mail, contracts waiting on you, outbid orders, low or reinforced structures and ready moon chunks, each one click from the page that fixes it.
- Alerts inbox: the bell in the top bar keeps the last two days of alerts (including ones held back in quiet hours). Click one to open what it's about. **Alert types** turns each kind of alert on or off.
- Pinned tools: ★ on any tool pins it to a Pinned tab in Tools, with the tools you used last beside it.
- Contracts and Notifications boards for all pilots in the sidebar: one list across every pilot, with contracts needing your action first and notifications sorted by kind. A contract between two of your pilots, or a corp notice every pilot got, shows once.
- Prices now come from Fuzzwork's market aggregates by default (much faster, hub buy and sell in one call), falling back to CCP's market if it's down. Settings → Prices switches back to CCP only.
- **Check for updates** on About & support and in Settings: asks GitHub straight away and says whether you're up to date, instead of waiting for the next check.
- Quiet updates (Settings → Notifications and behaviour): new versions download in the background and install when you close the app.
- Fit Library (Tools → Fitting): keep fits in folders with notes, import pasted EFT, your pilots' in-game fittings and your doctrines, see which pilots can fly each one and how long the rest need, and copy everything back out as EFT. **Add to library** in the Fit Checker.
- What to Train (Tools → Pilots): CCP's ship masteries I–V for every pilot, with the time to the next level and one click to make a skill plan, plus the certificates each pilot is closest to raising. Needs a one-time game data update.
- Ice & Ore Sites → Where ice spawns: the systems where ice belts can appear, nearest to your pilots (or any system) first, with how many belts and your own sightings. Snowflakes on the live map mark them. This is community data, since CCP doesn't publish it; Perrigen Falls isn't covered yet. Ice reported in a system that's not on the list is flagged.
- Live map → New Eden: the whole map, one box per region, with kills, ratting, traffic or sovereignty as heat, your pilots and intel. Click a region, then Open (or double-click) to go into it.
- Fixed: one-click update of the portable version closed the app and didn't reopen it. The update now runs separately from the app, falls back to placing the new version beside the old one if the file stays locked, and logs every step to logs/update.log. Updating from 1.12.0 portable still needs a manual download this one time.

## 1.12.0

- System Intel (Tools → Intel): search a system and see the last 6, 12, 24 or 48 hours: player kills by hour, who is killing and in what ships, where kills happen (with gate and undock camps called out), the most active pilots, every kill with its attackers, your own intel channel reports for the system, and what's happening within two jumps right now. Also on every system card.
- Help & guides (sidebar, the ? button or F1): a guide for every tool with step-by-step instructions, tips and screenshots, searchable and also found by Ctrl+K. ? opens the guide for the page you're on, and **Walk me through it** opens the tool with a step panel that highlights each control in turn.
- Battle reports in System Intel: kills close together are grouped into fights, split into the two sides, with each side's pilots, losses, ISK lost and efficiency.
- Wormhole mapper: a rolling planner (which ships to send, hot or cold, so the hole closes on a jump back without stranding anyone, checked against the ±10% mass variation); import maps from Pathfinder, Wanderer, Nexum or a plain system list; signatures that disappear from your scanner are crossed out with one button to delete them all. Shared maps now keep reduced and critical mass.
- Station Trading (Tools → Market): scans every item at a hub for buy-order to sell-order spreads that clear your sales tax and broker fee (from a pilot's skills), filtered by daily volume, with what you'd make a day.
- Trade Profit: choose first in, first out or weighted average cost; profit split into station trading and hauling; leave single buys, items or whole stations out.
- Job Splitter (Tools → Industry): paste what you want built and get jobs for each pilot's free slots, each under the time limit you choose, using copies first, with a shopping list of what you don't already own and where the rest is.
- Blueprint Prices (Tools → Industry): what originals and copies really sell for on public contracts, per run for copies, in the main trade regions.
- Appraisal takes a zKillboard or in-game kill link: what dropped, what was destroyed and the total.
- Corporation → Fuel: each structure's bay, burn a day and how long it lasts, fuel blocks and magmatic gas in corp hangars, and how many days they cover.
- Corporation → Leaderboard: members ranked by ratting tax paid and by moon ore mined.
- When Tranquility is down the app says so with a banner, shows the last data it loaded instead of spinning, checks every 30 seconds and reloads the page when the server is back. Every request now times out instead of hanging.
- Fixed: EVE news always failed (CCP's news feed address returns an error); it now reads CCP's main feed and keeps the last news if a check fails.
- Intel Watch: click a row in Kill activity near you for the kills there in the last two hours, who's doing them, in what, and any gate camp, with links to System Intel and zKillboard. Click a pilot in Threats in Local for what they said, why they were graded that way, what they fly and their recent kills, and tag them as hostile. Times over an hour now read in hours or days.
- Live map: systems no longer overlap, the map uses the full width, constellation names are shown, and zooming in shows each system's security, jumps and NPC kills.
- Ice & Ore Sites (Tools → Industry): ice belts and ore sites from your probe scans (pasted, or copied in game with the clipboard watch on) and from intel channel messages, with alerts when ice or an ore site turns up within so many jumps of your pilots. Remembers which systems have had ice. CCP doesn't share anomalies outside the game, so this is as close as it gets.
- Moon chunk alerts for directors: an hour before each chunk arrives and when it's ready, as a Windows/phone alert and on the structures Discord webhook, plus a Moon chunks list with jumps from your nearest pilot.

## 1.11.1

- Fixed: one-click update of the portable version failed with "resource busy or locked". The portable launcher keeps its own file open until the app has closed, so the swap now happens just after the app closes and the new version opens by itself. Updating from 1.10.0 or 1.11.0 portable still needs a manual download this one time; the folder (win-x64 zip) version updates normally.

## 1.11.0

- Route planner: start typing in From or To to pick a system, NPC station or one of your structures, with how many of your items are at each. ★ saves favourites for one-click routes (⇤ uses one as the start), ⌂ lists the stations in a system, ⇅ swaps start and destination. Picking a station sets the in-game destination to the station itself.
- D-scan: ships sorted by role (combat, tackle and ewar, logistics, capitals, haulers), and a "Worth knowing" list of dangerous hulls and objects in priority order: supercapitals, black ops, recons, interdictors and HICs, cynos, bubbles, probes, mobile tractor units and depots.
- My Orders: "Update next order" copies a price that beats the best order (to EVE's four-digit rule) and opens the item's market in game. Ctrl+Alt+N does the same while you're in game.
- System cards show when the system is busy: kills by day and hour, with the busiest and quietest times.
- Compare Skills (Tools → Pilots): up to 10 pilots side by side, only where they differ if you like, with CSV export of skills and queues. The skill planner can drop already-trained skills from a plan.
- Streamer mode (◐ in the top bar, or Ctrl+Shift+H): blurs pilot names, portraits, wallets and locations.
- Incursion payouts show as their own income source, with sites and ISK per hour on Ratting & Abyss.
- PI watchdog: works out when each colony's storage fills up and when factories run out of inputs, not just when extractors stop. Alerts a set number of hours ahead, reminds you twice if it isn't fixed, clears itself once you fix it, and can be snoozed per colony.
- Build Calculator shopping list: takes what your pilots already own off the materials list, checks you have the blueprint, and copies the rest for EVE's Multibuy.
- What to Build (Tools → Industry): ranks your own blueprints by profit per day, capped by how much the market really buys.
- Agent Finder (Tools → Navigation): find agents by level, division, kind, faction and distance, with mission hubs. "Buy with LP" finds every NPC store selling an item and its nearest station. Needs a one-time game data update.
- Hunting & Ratting has a Gate camps mode: active gate and undock camps near you, with the ships and pilots camping, for when you want a fight.
- Daily goals: set today's goals once (they're the same for every pilot), then open any pilot to see each goal with a tip on doing it quickly and tick off the ones they've done. Two goals ticked marks the pilot done for the day and moves the monthly track on.

## 1.10.0

- Fit checker: damage, tank and capacitor. DPS and volley, EHP and resists per layer, active and passive tank, capacitor stability with and without the prop module, speed, align, signature and targeting, for all skills at V or any of your pilots. Calculated with EVEShip.fit's open-source engine; the first check downloads its game data (about 10 MB).
- One-click updates: Update now downloads the new version, checks it against the release checksum, and restarts on it. Works for the portable exe and the unzipped folder, and keeps all your data.
- Price alerts: watch items at any trade hub and get a Windows or phone alert when the price drops below or rises above the prices you set. Price history for each item, and a Price alert button on item cards and in the item database.
- Mail for all pilots: one inbox across every pilot, with reply, reply to all, forward and new mail from the app. Answer calendar invites (Accept, Maybe, Decline) from each pilot's Calendar.
- Fits to and from the game: Save to game from the fit checker, and Check fit on saved in-game fittings, Wall of Shame losses and kills.
- Sending is opt-in (Settings → In-game control and sending) and needs four extra scopes on your app registration.
- Asset finder: search every pilot's assets at once, sort by jumps from any system, and get a plan for gathering things in one place.
- Ore values: ISK per m³ for ore, moon ore, ice and gas, sold raw, compressed or reprocessed, and ISK per hour at your mining rate.
- Copy EVE settings: copy a pilot's window layout and overview, or an account's hotkeys, to your other pilots or accounts, with a backup and undo.
- Quiet hours with exceptions, and alerts on or off for each pilot.
- Under-attack alert from the combat log: overlay flash, beep, speech and phone alert when a player shoots one of your pilots.
- Backup and restore: everything in one password-protected file, pilots included.
- Privacy and permissions on the About page: what each permission is for and which outside services the app talks to.
- Linux: an AppImage build, and the intel and combat logs are found in the Steam/Proton folder.
- Fixed: a wormhole map code pasted with chat text after it sometimes failed to import.
- Fixed: Trade Profit didn't load in the app since 1.8.8.

## 1.9.0

- Fit checker: paste an EFT fit to see its slots, CPU, powergrid and calibration with each pilot's skills, who can fly it, what it costs and the hull's base stats, with Open in Pyfa. Doctrine fits have a Check button.
- Quick-look popups: click a pilot, item icon or system name to see a card over the page. Pilot cards show the threat grade and recent activity; item cards show hub prices, stats and who can use it; system cards show kills, sov, planets, gates and wormhole info.
- Route links on the live map, hunting list and Nearby planets, "Who lives here?" in the wormhole mapper and doctrine fit Check now open as popups.
- Rows that open for more detail (marked ▸): Trade Profit sales matched to buys and the split by pilot, every item in a contract bargain, why a loss is on the Wall of Shame with its fit, kills in a route system, missing skills in the fit checker, courier routes system by system, ratting bounty ticks, Abyss loot, and the ships, pilots and ISK on Pilot Intel kills and losses.
- Wormhole mapper: share maps with ⇄ Share. Copy a map as text for Discord or EVE mail, or save it to a file, and import one as a new map or merged into yours.
- On start, the app checks the game data and offers to download or update it when needed: when it's missing, when this version needs parts your copy doesn't have, or when CCP has released newer data. Updates you skip aren't asked about again until the next one.
- The window opens half as big again (1920 × 1230, or as much as fits the screen) and remembers its size and position.
- Settings are folded into sections.
- Fit checker: Appraise opens in a popup instead of leaving the page.
- Five glass themes: Nebula Glass, Ice Field Glass, Drifter Glass, Solar Glass and Frosted Daylight.
- Five new themes: Gunmetal Glass, Gunmetal Ember, Liquid Glass, Liquid Gunmetal and Liquid Daylight.
- The overlay now follows the app's theme, including location-based switching.
- EVE Toolkit is now free software under the GNU GPL version 3 or later. The licence is included with the download and shown on the About page.
- After updating, go to Settings → Game data → Update once more so the fit checker and item database have every item attribute.

## 1.8.9

- Nearby planets: find the closest systems with the planet types you need for PI, from any system or pilot, within a jump limit and the areas of space you choose. Needs a one-time game data update (Settings → Game data → Update).

## 1.8.8

- Search: press Ctrl+K (or click Search) to find any tool, page, pilot, item or wormhole.
- Getting-started checklist on the All pilots page.
- Large records (trade ledger, contract cache, net worth history, Abyss runs and more) now live in their own files, so saving stays quick as history builds up. Moved automatically on first start.
- Diagnostics show the size of each data file.
- Update checks now use this GitHub Releases page.

## 1.8.7

- Contract bargain finder, character value and item database.

## 1.8.6

- Trade profit tracker, moon scan value, wormhole statics and effects.

## 1.8.5

- Jump clone, jump fatigue and incursion alerts. Skill farm calculator and insurance check. PLEX now priced from CCP's global PLEX market.

## 1.8.4

- Daily rewards page: server up and long downtime alerts, Daily Goals ticks, monthly track, EVE news watcher for login campaigns and SP events.

## 1.8.3

- Appraisal: supercarriers, titans and other contract-only items valued at the higher of CCP's average and their material cost, with your own price as an option.
