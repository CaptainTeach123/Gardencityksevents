#!/usr/bin/env node
/*
 * Convert a VisitGCK.com iCal export into events.js for the map.
 *
 *   node scripts/build-events.js [input.ics] [output.js]
 *   (defaults: data/visitgck.ics -> events.js)
 *
 * Export the .ics from the "Subscribe / Export" link on https://www.visitgck.com/events-calendar/
 * Venues are looked up in scripts/venues.json; unknown venues are skipped and listed.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const input = process.argv[2] || path.join(root, "data", "visitgck.ics");
const output = process.argv[3] || path.join(root, "events.js");
const venuesFile = path.join(__dirname, "venues.json");
const venues = JSON.parse(fs.readFileSync(venuesFile, "utf8"));
const note = venues._note;
delete venues._note;

const TZ = "America/Chicago";
const DEFAULT_HOURS = 2; // events with no end time (DTEND == DTSTART) are shown as active for this long

/* ---- iCal parsing ---- */
function unfold(text) {
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}
const unescapeText = (s) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

function parseEvents(text) {
  const events = [];
  let cur = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") { events.push(cur); cur = null; }
    else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(";");
      cur[name.toUpperCase()] = { value: line.slice(i + 1), params };
    }
  }
  return events;
}

/* -> "YYYY-MM-DDTHH:MM" in Garden City time */
function toLocal({ value, params }) {
  const m = value.match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/);
  if (!m) throw new Error("Unparseable date: " + value);
  const [, y, mo, d, h = "00", mi = "00", , z] = m;
  if (z) { // UTC -> Central
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(Date.UTC(+y, mo - 1, +d, +h, +mi))).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  return `${y}-${mo}-${d}T${h}:${mi}`;
}
function addMinutes(local, mins) {
  const [d, t] = local.split("T"); const [y, mo, da] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, da, h, mi + mins)).toISOString().slice(0, 16);
}

/* ---- venue + category ---- */
function findVenue(location, description) {
  const hay = [location, ""].join(" ").toLowerCase();
  const fallback = (description || "").toLowerCase();
  for (const src of location ? [hay] : [fallback]) {
    for (const [id, v] of Object.entries(venues)) if (v.match.some((k) => src.includes(k))) return id;
  }
  return null;
}
/* A venue we've never seen: create an entry from the LOCATION text. It has no coordinates until
 * scripts/geocode.js fills them in; events there are held back (and reported) until then. */
function addVenue(location) {
  const parts = location.split(",").map((x) => x.trim()).filter((x) => x && !/^united states$/i.test(x));
  if (!parts.length) return null;
  const name = parts[0];
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!id) return null;
  if (!venues[id]) {
    const street = parts.slice(1).join(", ");
    venues[id] = { name, address: street ? `${street}` : `${name}, Garden City, KS`, match: [name.toLowerCase()], lat: null, lng: null, approx: true, auto: true };
    addedVenues.push(name);
  }
  return id;
}

const CATEGORY_RULES = [   // first match wins
  ["music",     /karaoke|singo|concert|live music|band/i],
  ["sports",    /rodeo|golf|buffalo dunes|water walking|5k|race|football|soccer|volleyball|basketball/i],
  ["food",      /wine|tasting|gala|food truck|dinner|market/i],
  ["family",    /fall fest|hootenanny|funday|story|kitchen fun|pok[eé]mon|family|kids|trunk|trick/i],
  ["arts",      /arts|craft|macrame|clay|paint|studio|writers|maker|class/i],
];
function categorize(title) {
  for (const [c, re] of CATEGORY_RULES) if (re.test(title)) return c;
  return "community";
}

/* ---- build ---- */
const raw = parseEvents(fs.readFileSync(input, "utf8"));
const out = [], skipped = [], pending = new Set(), addedVenues = [];
for (const r of raw) {
  const title = unescapeText(r.SUMMARY?.value || "").trim();
  const location = r.LOCATION ? unescapeText(r.LOCATION.value) : "";
  const desc = r.DESCRIPTION ? unescapeText(r.DESCRIPTION.value) : "";
  const venue = findVenue(location, desc) || (location ? addVenue(location) : null);
  if (!venue) { skipped.push(`${title} (no location)`); continue; }
  if (venues[venue].lat == null) { pending.add(venues[venue].name); skipped.push(`${title} @ ${venues[venue].name} (no coordinates yet)`); continue; }

  const start = toLocal(r.DTSTART);
  let end = r.DTEND ? toLocal(r.DTEND) : start;
  let open = false;
  if (end <= start) { end = addMinutes(start, DEFAULT_HOURS * 60); open = true; }

  const ev = { title, venue, category: categorize(title), start, end };
  if (open) ev.open = true;                       // end time unknown: UI shows only the start
  if (r.URL) ev.url = r.URL.value;
  ev.desc = desc.replace(/\s+/g, " ").trim().slice(0, 320);
  out.push(ev);
}
out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

if (addedVenues.length) {
  fs.writeFileSync(venuesFile, JSON.stringify({ _note: note, ...venues }, null, 2) + "\n");
  console.log(`Added ${addedVenues.length} new venue(s) to scripts/venues.json: ${addedVenues.join("; ")}`);
}

const usedVenues = Object.fromEntries(
  Object.entries(venues).filter(([id]) => out.some((e) => e.venue === id))
    .map(([id, v]) => [id, { name: v.name, address: v.address, lat: v.lat, lng: v.lng, ...(v.approx ? { approx: true } : {}) }]));

const meta = {
  source: "VisitGCK.com", sourceUrl: "https://www.visitgck.com/events-calendar/",
  from: out[0]?.start.slice(0, 10), to: out[out.length - 1]?.start.slice(0, 10),
};

const body =
`/* GENERATED by scripts/build-events.js from ${path.basename(input)} — edit scripts/venues.json or re-run, not this file.
 * Times are Garden City local time "YYYY-MM-DDTHH:MM"; \`end\` is exclusive. \`open: true\` = end time unknown. */
window.EVENTS_META = ${JSON.stringify(meta)};
window.VENUES = ${JSON.stringify(usedVenues, null, 2)};
window.EVENTS = [
${out.map((e) => "  " + JSON.stringify(e)).join(",\n")}
];
`;
fs.writeFileSync(output, body);

console.log(`Wrote ${out.length} events at ${Object.keys(usedVenues).length} venues (${meta.from} → ${meta.to}) to ${path.relative(process.cwd(), output)}`);
if (skipped.length) console.warn(`\nSkipped ${skipped.length} event(s):\n  ` + skipped.join("\n  "));
if (pending.size) console.warn(`\nRun scripts/geocode.js, then build again, to place: ${[...pending].join("; ")}`);
