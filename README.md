# Garden City Event Map

Interactive map of events in Garden City, KS. Pick a date and time and see which events are
**happening then** (green, pulsing) and which are **upcoming** (blue), with a list alongside the map.

- Phone-first layout: full-screen map, a compact "when" bar (day strip with event counts, time slider that shows how
  busy the day is, quick times, "Now"), category filters, and a draggable bottom sheet with the event list and venue details.
  On desktop the same pieces sit in a left panel. Light and dark mode follow the device.
- Pins are colour-coded by category; a pulsing green dot means something is happening right now. Nearby venues group
  into a numbered bubble that zooms in when tapped. "Locate me" and "show all" buttons sit on the map.
- "Upcoming" range: only then / rest of the day / next 7 days / all upcoming, plus a "show ended" filter.
- **Calendar:** every event has "＋ Google Calendar" and "＋ Apple / Outlook (.ics)"; the sidebar button downloads
  whatever events are currently showing; and visitors can **subscribe** to `garden-city-events.ics`
  (Apple/Outlook via `webcal://`, or Google Calendar) — the feed is rebuilt with `events.js`, so subscribers get updates.
- **Google Maps:** every venue's detail view has "Directions" and "Open in Google Maps" links (links only — no API key needed).
- Shareable links: `index.html#d=2026-10-10&t=18:30&w=week`.

## Run

No build step. Open `index.html` in a browser (needs internet for the Leaflet library and OpenStreetMap tiles),
or serve the folder: `python3 -m http.server`.

## Updating events (from VisitGCK.com)

Events come from the iCal export of https://www.visitgck.com/events-calendar/ (their site blocks automated
requests, so download the `.ics` in your browser).

```
# 1. save the export as data/visitgck.ics
# 2. regenerate events.js
node scripts/build-events.js
```

- Venues are defined in `scripts/venues.json`. If the build reports "unknown venue", add it there
  (`match` = lowercase text found in the event's location).
- **Pin locations are rough estimates** (`"approx": true`; popups say so). Run
  `node scripts/geocode.js` on a machine with internet to look up real coordinates from each venue's address
  (OpenStreetMap Nominatim), then re-run the build. Check the result on the map.
- Events with no published end time show only a start time and count as "happening" for 2 hours.
- The current data covers Oct 9–14, 2026 only; the map says so when you pick a date outside the range.
