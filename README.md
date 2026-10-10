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

## Install on a phone (PWA)

The site is an installable web app with its own icon, full-screen launch and offline support (the app, saved events and
the map and its tiles load without a connection once the page has been opened online).

- **iPhone:** open the site in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open in Chrome and tap **Install app** (shown at the bottom of the event list) or the browser menu's "Install".

Files: `manifest.webmanifest` (name, icons, colours), `sw.js` (offline caching: our own files are network-first so new
events appear right away), `icons/` (sunflower icon in the sizes iOS/Android need), `vendor/leaflet/` (the map library,
bundled so nothing important loads from a CDN). If you change `sw.js` caching rules, bump `VERSION` at the top of it.

## Run

No build step. Serve the folder (the offline map file is loaded with fetch, so double-clicking `index.html` won't work): `python3 -m http.server`.

## The map (Protomaps)

The basemap is drawn in the browser from `tiles/garden-city.pmtiles`, a small (~1.4 MB) OpenStreetMap-based map of
Garden City that lives in this repo. There is no third-party tile server, so there are no per-view fees or usage
limits to worry about, and it works offline once loaded. Libraries: `vendor/protomaps/` (BSD-3-Clause).

To refresh the map data (or change the area), run **Actions → Build Garden City map tiles → Run workflow**. It cuts the
area out of Protomaps' free daily world build and redeploys the site. Map data © OpenStreetMap contributors (ODbL);
keep the attribution in the corner of the map.

## Look and feel

- **Map style:** our own palette (warm paper land, sage parks, soft blue water, golden highways) with a matching dark
  version. Colours live in the `FLAVORS` object in `index.html`; the defaults they extend are in `vendor/protomaps/flavors.js`.
- **Pins and clusters:** pins are coloured by category with the venue name showing when you zoom in; clusters are donuts
  coloured by what's inside them.
- **List rows** lead with the start time; live events are highlighted green with an "until" tag. Venue pages open with a header
  coloured by category. There's a loading screen, gentle entrance animations, and everything respects "reduce motion".

## Using it on a phone

- **Quick picks** (Now · Tonight · Tomorrow · Weekend · Anytime) sit at the top of the list, within thumb reach. Picking
  one sets the time and window for you; changing the time by hand clears the pick.
- **Search** (magnifier in the top bar) looks through titles, venues, categories and descriptions across every date.
- **Back button:** on Android, Back closes the open venue, day plan or calendar sheet instead of leaving the site.
- **Share** an event from its detail view (the phone's share sheet, or copies the link on desktops).
- **First visit:** a small "New here?" tip explains the basics once and stays dismissed afterwards.
- Tap targets are at least 40–44 px, the time panel starts collapsed on small screens, and landscape phones get a
  compact layout so the list stays usable.

## Where the events come from

Events are merged from four places and de-duplicated (when VisitGCK and the organizer both list the same event, the
organizer's own listing wins):

| Source | How it's fetched |
|---|---|
| Finney County Public Library | automatically, daily (their public calendar API) |
| Garden City Arts | automatically, daily (their website's JSON feed) |
| Garden City Community College | automatically, daily (`events.json` on their site) |
| VisitGCK.com | **by hand**: their site blocks robots. Export the calendar and upload it as `data/visitgck.ics` |

The **Update events** workflow (Actions tab) runs every morning, or whenever `data/visitgck.ics` is uploaded, or from
**Run workflow**. It runs `scripts/pull-feeds.js` (-> `data/feeds.json`), `scripts/build-events.js` (-> `events.js` and the
subscribable `garden-city-events.ics`), places any new venues with `scripts/geocode.js`, and redeploys the site. If one
source is down, its last saved events are kept. To add another source, write a small adapter in `scripts/pull-feeds.js`.

Venues live in `scripts/venues.json` (new ones are added automatically; fix a pin by editing `lat`/`lng` and deleting `approx`).

## Plan my day

Tap the heart on any event to add it to "my day" (saved on the visitor's phone). **Plan my day** shows the day as a
12-hour clock: each planned event is an arc around the rim (overlaps stack in rings), the hands show the selected time and
can be dragged, and AM/PM tabs flip between halves. Below the clock are the planned events with drive-time warnings
(for example "Tight: 5 min between, about 9 min to drive"), ideas to add, and a button that exports the day to a calendar.

