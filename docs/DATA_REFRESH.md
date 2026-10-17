# Data to refresh

Outside data the app keeps a copy of, which goes out of date on its own. Check each line when it is due, refresh it with the steps given, and write
the new dates here. Nothing in the app reminds anyone yet: this file is the reminder. Timed reminders are planned for the real app's launch (see "Deferred to launch: upkeep timers and reminders" in `docs/ARCHITECTURE_PLAN.md`).

## The Atlas's map data (`atlasdata.js`)

**Every six months** (next: **April 2027**). At the latest once a year.

| Source | What changes | Last refreshed | Next due |
|---|---|---|---|
| INAO, *Délimitation parcellaire des AOC viticoles* (data.gouv.fr, Licence Ouverte) | INAO keeps adding AOCs not yet published (Champagne is missing) and revises parcel boundaries; a new file comes out several times a year | 2026-10-17 (INAO's release of 2026-10-12) | 2027-04 |
| UC Davis AVA project (CC0) | New American Viticultural Areas are approved several times a year | 2026-10-17 | 2027-04 |
| Natural Earth countries and states/provinces (public domain) | Rarely; a new version every year or two | 2026-10-17 | 2027-10 |

**How:** the steps are at the top of `docs/atlas_data.mjs` (download into a folder outside the repository, merge the French AOCs with mapshaper,
run the script). Then:
- Bump `atlasdata.js?v=` where it is imported (`atlasview.js`), and the files that import those (the usual release rule).
- Check the licence on each source page is still the same (INAO: "Licence Ouverte"; UC Davis: CC0; Natural Earth: public domain).
- Open the Atlas and look at a few places: Margaux, Napa Valley, and anything newly added (Champagne once INAO publishes it).
- Note how big the file got (it was about 290 KB compressed in October 2026).
- Write the new dates in the table above.

**Also run it when the catalog gains new appellations:** the card map's lighter file (`atlaslite.js`) holds the outlines of the appellations the catalog uses, read from the place list when the script runs. A new appellation shows on the card's map as a dot until then (the full Atlas shows its outline straight away).

When a new open source is chosen for another country (see the open item in `docs/ARCHITECTURE_PLAN.md`), add it to the table.
