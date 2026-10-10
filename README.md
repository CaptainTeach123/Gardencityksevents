# Garden City Event Map

Interactive map of events in Garden City, KS. Pick a date and time and see which events are
**happening then** (green, pulsing) and which are **upcoming** (blue), with a list alongside the map.

- Date/time pickers, a time-of-day slider, prev/next day, and a **Now** button (Garden City time).
- "Upcoming" range: rest of the day / next 7 days / all future / only events happening then.
- Category filters, venue pins that group multiple events, click a list item to jump to its pin.
- Shareable links: `index.html#d=2026-10-10&t=18:30&w=week`.

## Run

No build step. Open `index.html` in a browser (needs internet for the Leaflet library and OpenStreetMap tiles),
or serve the folder: `python3 -m http.server`.

## Editing events

All data lives in `events.js`. **The current events are sample placeholders** and venue coordinates are approximate —
replace them with real ones. Times are local `YYYY-MM-DDTHH:MM`; `end` is exclusive. Categories are defined in `index.html`.
