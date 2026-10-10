#!/usr/bin/env node
/*
 * Build events.js (and the subscribable garden-city-events.ics) for the map from:
 *   - data/visitgck.ics   a VisitGCK.com iCal export (upload it by hand, their site blocks robots)
 *   - data/feeds.json     the library, Garden City Arts and GCCC feeds (scripts/pull-feeds.js, runs daily)
 *
 *   node scripts/build-events.js [visitgck.ics] [output.js]
 *
 * Duplicates (the same event listed by VisitGCK and by its organizer) are merged, keeping the organizer's version.
 * Venues come from scripts/venues.json; new ones are added automatically and placed by scripts/geocode.js.
 */
const fs = require("fs");
const path = require("path");
const IcsExport = require("../ics.js");

const root = path.join(__dirname, "..");
const input = process.argv[2] || path.join(root, "data", "visitgck.ics");
const feedsFile = path.join(root, "data", "feeds.json");
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
  ["music",     /karaoke|singo|concert|live music|band|choir|orchestra/i],
  ["sports",    /rodeo|golf|buffalo dunes|water walking|5k|race|football|soccer|volleyball|basketball|tailgate|tournament|cross country|track/i],
  ["food",      /wine|tasting|gala|food truck|dinner|market|brew|lunch|breakfast/i],
  ["family",    /fall fest|hootenanny|funday|story|kitchen fun|pok[eé]mon|family|kids|trunk|trick|toddler|baby|babies|wee readers|lego/i],
  ["arts",      /arts|craft|macrame|clay|paint|studio|writers|maker|class|pour|canvas|theat|exhibit|gallery/i],
];
const TAG_RULES = [["family", /babies|toddler|family|kids|children/i], ["arts", /art|craft/i], ["music", /music/i], ["sports", /sport|athletic/i]];
function categorize(title, tags = []) {
  for (const [c, re] of CATEGORY_RULES) if (re.test(title)) return c;
  for (const [c, re] of TAG_RULES) if (tags.some((t) => re.test(t))) return c;
  return "community";
}

/* ---- gather candidates from every source ---- */
const SOURCES = {
  visitgck: { name: "VisitGCK.com", url: "https://www.visitgck.com/events-calendar/" },
  library:  { name: "Finney County Public Library", url: "https://finneylibrary.org/events/" },
  gca:      { name: "Garden City Arts", url: "https://gardencityarts.org/upcoming-events" },
  gccc:     { name: "Garden City Community College", url: "https://www.gcccks.edu/events/" },
};
const PRIORITY = { library: 0, gca: 0, gccc: 0, visitgck: 1 };   // when two sources list the same event, the organizer's own listing wins

const cands = [];
let stamp;
if (fs.existsSync(input)) {
  const raw = parseEvents(fs.readFileSync(input, "utf8"));
  stamp = raw.map((r) => r["LAST-MODIFIED"]?.value || r.DTSTAMP?.value || "").filter((x) => /Z$/.test(x)).sort().pop() || undefined;
  for (const r of raw) {
    const start = toLocal(r.DTSTART);
    let end = r.DTEND ? toLocal(r.DTEND) : start, open = false;
    if (end <= start) { end = addMinutes(start, DEFAULT_HOURS * 60); open = true; }
    cands.push({ source: "visitgck", title: unescapeText(r.SUMMARY?.value || "").trim(), desc: r.DESCRIPTION ? unescapeText(r.DESCRIPTION.value) : "",
      location: r.LOCATION ? unescapeText(r.LOCATION.value) : "", start, end, open, url: r.URL?.value, tags: [] });
  }
} else console.warn(`(no ${path.relative(root, input)} yet, building from the feeds only)`);
let feedInfo = {};
if (fs.existsSync(feedsFile)) {
  const f = JSON.parse(fs.readFileSync(feedsFile, "utf8"));
  feedInfo = f.sources || {};
  cands.push(...(f.events || []));
}

/* ---- same event listed twice? ---- */
const MONTH_WORDS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
const STOP = new Set(["the", "a", "an", "and", "at", "of", "with", "for", "in", "on", "to"]);
function words(title, venueName) {
  let t = title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(new RegExp(`^${venueName.toLowerCase().replace(/[^a-z0-9 ]/g, ".")}\\s*[:\\-–]\\s*`), "");
  t = t.replace(/[^a-z0-9 ]+/g, " ").replace(new RegExp(`\\b(${MONTH_WORDS})\\b`, "g"), " ").replace(/\b\d+(st|nd|rd|th)?\b/g, " ");
  return new Set(t.split(/\s+/).filter((w) => w && !STOP.has(w)));
}
function sameEvent(a, b) {
  if (a.venue !== b.venue || a.allDay !== b.allDay) return false;
  if (Math.abs(Date.parse(a.start + ":00Z") - Date.parse(b.start + ":00Z")) > 30 * 60000) return false;
  const A = words(a.title, venues[a.venue].name), B = words(b.title, venues[b.venue].name);
  if (!A.size || !B.size) return a.title.toLowerCase() === b.title.toLowerCase();
  const common = [...A].filter((w) => B.has(w)).length;
  return common >= 1 && common / Math.min(A.size, B.size) >= 0.8;
}

/* ---- build ---- */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const cutoff = `${new Date(Date.parse(today + "T00:00:00Z") - 86400000).toISOString().slice(0, 10)}T00:00`;   // drop anything that ended before yesterday
const out = [], skipped = [], pending = new Set(), addedVenues = [];
let dupes = 0;
cands.sort((a, b) => (PRIORITY[a.source] ?? 1) - (PRIORITY[b.source] ?? 1));
for (const c of cands) {
  if (c.end <= cutoff) continue;
  const venue = findVenue(c.location, c.desc) || (c.location ? addVenue(c.location) : null);
  if (!venue) { skipped.push(`${c.title} (no location)`); continue; }
  if (venues[venue].lat == null) { pending.add(venues[venue].name); skipped.push(`${c.title} @ ${venues[venue].name} (no coordinates yet)`); continue; }

  const ev = { title: c.title, venue, category: categorize(c.title, c.tags || []), start: c.start, end: c.end };
  if (c.open) ev.open = true;                      // end time unknown: UI shows only the start
  if (c.allDay) ev.allDay = true;
  if (c.url) ev.url = c.url;
  ev.src = c.source;
  ev.desc = (c.desc || "").replace(/\s+/g, " ").trim().slice(0, 320);
  if (out.some((o) => sameEvent(o, ev))) { dupes++; continue; }
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

const usedSources = [...new Set(out.map((e) => e.src))];
const meta = {
  sources: Object.fromEntries(usedSources.map((k) => [k, SOURCES[k] || { name: k }])),
  from: out[0]?.start.slice(0, 10), to: out[out.length - 1]?.start.slice(0, 10),
};

const body =
`/* GENERATED by scripts/build-events.js from ${path.basename(input)} + data/feeds.json — edit scripts/venues.json or re-run, not this file.
 * Times are Garden City local time "YYYY-MM-DDTHH:MM"; \`end\` is exclusive. \`open: true\` = end time unknown. */
window.EVENTS_META = ${JSON.stringify(meta)};
window.VENUES = ${JSON.stringify(usedVenues, null, 2)};
window.EVENTS = [
${out.map((e) => "  " + JSON.stringify(e)).join(",\n")}
];
`;
fs.writeFileSync(output, body);

// Subscribable calendar feed (served next to the page as garden-city-events.ics)
const feed = path.join(path.dirname(output), "garden-city-events.ics");
fs.writeFileSync(feed, IcsExport.build(out, usedVenues, { name: "Garden City, KS Events", stamp }));

console.log(`${Object.entries(Object.fromEntries(usedSources.map((k) => [k, out.filter((e) => e.src === k).length]))).map(([k, n]) => `${k}: ${n}`).join(", ")}; ${dupes} duplicate(s) merged`);
for (const [k, v] of Object.entries(feedInfo)) if (!v.ok) console.warn(`⚠ ${k} feed failed on its last pull (${v.error}); showing its previously saved events`);
console.log(`Wrote ${out.length} events at ${Object.keys(usedVenues).length} venues (${meta.from} → ${meta.to}) to ${path.relative(process.cwd(), output)} and ${path.basename(feed)}`);
if (skipped.length) console.warn(`\nSkipped ${skipped.length} event(s):\n  ` + skipped.join("\n  "));
if (pending.size) console.warn(`\nRun scripts/geocode.js, then build again, to place: ${[...pending].join("; ")}`);
