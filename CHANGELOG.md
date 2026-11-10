# Changelog

## Next release

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
