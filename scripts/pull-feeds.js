#!/usr/bin/env node
/*
 * Pull events from local organizations' public feeds into data/feeds.json (one common format).
 *
 *   node scripts/pull-feeds.js
 *
 * Sources (all read-only, polite, once a day from the GitHub workflow):
 *   library  Finney County Public Library   The Events Calendar REST API (JSON)
 *   gca      Garden City Arts               Squarespace "?format=json" of the events page
 *   gccc     Garden City Community College  /_resources/data/events.json
 *
 * If a source fails, its previously saved events are kept so a hiccup doesn't empty the map.
 * scripts/build-events.js merges this file with the VisitGCK export.
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "data", "feeds.json");
const UA = "gardencityksevents-map/1.0 (+https://github.com/CaptainTeach123/Gardencityksevents)";
const TZ = "America/Chicago";
const DAYS_AHEAD = 75;
const DEFAULT_HOURS = 2;

/* ---------- small helpers ---------- */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };
const decode = (s) => String(s ?? "")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const stripHtml = (h) => decode(String(h ?? "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function localParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const fromEpoch = (ms) => { const p = localParts(new Date(ms)); return `${p.date}T${p.time}`; };
const addDays = (d, n) => { const [y, m, da] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, da + n)).toISOString().slice(0, 10); };
const addMinutes = (s, mins) => { const [d, t] = s.split("T"); const [y, mo, da] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); return new Date(Date.UTC(y, mo - 1, da, h, mi + mins)).toISOString().slice(0, 16); };

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30000), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/* ---------- library: The Events Calendar (Tribe) REST API ---------- */
function normalizeLibrary(json) {
  const out = [];
  for (const e of json.events || []) {
    const tags = (e.categories || []).map((c) => decode(c.name));
    if (tags.some((t) => /closure/i.test(t))) continue;                       // "library closed" notices aren't events
    const title = stripHtml(e.title);
    const v = e.venue && !Array.isArray(e.venue) ? e.venue : null;
    const where = v && v.venue ? [stripHtml(v.venue), stripHtml(v.address || ""), stripHtml(v.city || "Garden City"), "KS"].filter(Boolean).join(", ")
                               : "Finney County Public Library, 605 E Walnut St, Garden City, KS";
    const start = String(e.start_date).replace(" ", "T").slice(0, 16);
    let end = String(e.end_date || e.start_date).replace(" ", "T").slice(0, 16);
    const ev = { source: "library", title, desc: stripHtml(e.description || e.excerpt), location: where, start, end, url: e.url, tags };
    if (e.all_day) { ev.allDay = true; ev.start = start.slice(0, 10) + "T00:00"; ev.end = addDays(end.slice(0, 10), 1) + "T00:00"; }
    else if (end <= start) { ev.end = addMinutes(start, DEFAULT_HOURS * 60); ev.open = true; }
    out.push(ev);
  }
  return out;
}
async function pullLibrary() {
  const today = localParts(new Date()).date, until = addDays(today, DAYS_AHEAD);
  const events = [];
  for (let page = 1; page <= 20; page++) {
    const j = await getJson(`https://finneylibrary.org/wp-json/tribe/events/v1/events?per_page=50&page=${page}&start_date=${today}&end_date=${until}`);
    events.push(...(j.events || []));
    if (page >= (j.total_pages || 1)) break;
  }
  return normalizeLibrary({ events });
}

/* ---------- Garden City Arts: Squarespace JSON ---------- */
function normalizeGca(json) {
  const out = [];
  for (const it of json.upcoming || []) {
    if (!it.title || !it.startDate) continue;
    const loc = it.location || {};
    const where = [loc.addressTitle || "Garden City Arts", loc.addressLine1 || "318 N Main St", loc.addressLine2 || "Garden City", "KS"].map((x) => String(x).replace(/\.$/, "")).join(", ");
    const start = fromEpoch(it.startDate);
    let end = it.endDate ? fromEpoch(it.endDate) : start;
    const ev = {
      source: "gca", title: stripHtml(it.title), desc: stripHtml(it.excerpt || it.body || ""), location: where, start, end,
      url: it.fullUrl ? new URL(it.fullUrl, "https://gardencityarts.org").href : "https://gardencityarts.org/upcoming-events",
      tags: (it.categories || []).concat(it.tags || []).map(String),
    };
    if (end <= start) { ev.end = addMinutes(start, DEFAULT_HOURS * 60); ev.open = true; }
    out.push(ev);
  }
  return out;
}
const pullGca = async () => normalizeGca(await getJson("https://gardencityarts.org/upcoming-events?format=json"));

/* ---------- GCCC: events.json (dates are free text like "AUGUST 19, 2026 11:00 A.M.") ---------- */
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function parseGcccDate(str) {
  const s = String(str).toUpperCase().replace(/\s+/g, " ").trim().replace(/^(MON|TUE|WED|THU|FRI|SAT|SUN)[A-Z]*\.?,? /, "");   // drop a leading weekday
  const m = s.match(/^([A-Z]{3,9})\.? (\d{1,2})(?: ?[-–] ?(?:([A-Z]{3,9})\.? )?(\d{1,2}))?,? (\d{4})(?: (?:AT )?(\d{1,2})(?::(\d\d))? ?([AP])\.?M\.?)?/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].slice(0, 3)); if (mon < 0) return null;
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${m[5]}-${pad(mon + 1)}-${pad(+m[2])}`;
  if (m[6]) {                                                   // has a clock time
    let h = +m[6] % 12; if (m[8] === "P") h += 12;
    const start = `${date}T${pad(h)}:${m[7] || "00"}`;
    return { start, end: addMinutes(start, DEFAULT_HOURS * 60), open: true };
  }
  let lastDate = date;                                          // date only (maybe a range) = all-day
  if (m[4]) { const mon2 = m[3] ? MONTHS.indexOf(m[3].slice(0, 3)) : mon; if (mon2 >= 0) lastDate = `${m[5]}-${pad(mon2 + 1)}-${pad(+m[4])}`; }
  return { start: `${date}T00:00`, end: `${addDays(lastDate, 1)}T00:00`, allDay: true };
}
function normalizeGccc(list) {
  const out = [], bad = [];
  for (const it of Array.isArray(list) ? list : []) {
    const when = parseGcccDate(it.date);
    if (!when || !it.title) { bad.push(it.title || "(untitled)"); continue; }
    out.push({
      source: "gccc", title: stripHtml(it.title), desc: stripHtml(it.info || ""),
      location: "Garden City Community College, 801 Campus Dr, Garden City, KS",
      url: it.link ? new URL(it.link, "https://www.gcccks.edu").href : "https://www.gcccks.edu/events/", tags: [],
      ...when,
    });
  }
  if (bad.length) console.warn(`  gccc: skipped ${bad.length} entr${bad.length === 1 ? "y" : "ies"} with unreadable dates: ${bad.slice(0, 4).join("; ")}`);
  return out;
}
const pullGccc = async () => normalizeGccc(await getJson("https://www.gcccks.edu/_resources/data/events.json"));

/* ---------- run ---------- */
const SOURCES = {
  library: { name: "Finney County Public Library", url: "https://finneylibrary.org/events/", pull: pullLibrary },
  gca:     { name: "Garden City Arts",             url: "https://gardencityarts.org/upcoming-events", pull: pullGca },
  gccc:    { name: "Garden City Community College", url: "https://www.gcccks.edu/events/", pull: pullGccc },
};

async function main() {
  let previous = { events: [] };
  try { previous = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (_) {}
  const cutoff = `${addDays(localParts(new Date()).date, -1)}T00:00`;       // nothing that ended before yesterday
  const sources = {}, events = [];
  for (const [key, src] of Object.entries(SOURCES)) {
    try {
      const got = (await src.pull()).filter((e) => e.end > cutoff);
      events.push(...got);
      sources[key] = { name: src.name, url: src.url, ok: true, count: got.length };
      console.log(`✓ ${key}: ${got.length} events`);
    } catch (e) {
      const kept = (previous.events || []).filter((x) => x.source === key && x.end > cutoff);
      events.push(...kept);
      sources[key] = { name: src.name, url: src.url, ok: false, count: kept.length, error: String(e.message || e) };
      console.warn(`✗ ${key}: ${e.message || e} — kept ${kept.length} earlier event(s)`);
    }
  }
  events.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const next = JSON.stringify({ sources, events }, null, 1) + "\n";      // no timestamp, so unchanged feeds don't create a commit every day
  let same = false;
  try { same = fs.readFileSync(OUT, "utf8") === next; } catch (_) {}
  if (!same) fs.writeFileSync(OUT, next);
  console.log(`${same ? "No change:" : "Wrote"} ${events.length} events ${same ? "in" : "to"} ${path.relative(process.cwd(), OUT)}`);
  if (Object.values(sources).every((s) => !s.ok)) process.exit(1);
}

module.exports = { normalizeLibrary, normalizeGca, normalizeGccc, parseGcccDate, stripHtml };
if (require.main === module) main();
