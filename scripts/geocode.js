#!/usr/bin/env node
/*
 * Replace the rough lat/lng in scripts/venues.json with real coordinates from OpenStreetMap's
 * Nominatim geocoder, then re-run build-events.js.
 *
 *   node scripts/geocode.js          # geocode venues still marked approx
 *   node scripts/geocode.js --all    # re-geocode everything
 *
 * Needs internet access. Respects Nominatim's 1 request/second policy. Review the result:
 * venues it can't find are left unchanged (still approx).
 */
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "venues.json");
const venues = JSON.parse(fs.readFileSync(file, "utf8"));
const all = process.argv.includes("--all");
const CENTER = [37.9717, -100.8727];   // Garden City; results farther than MAX_KM are rejected as wrong matches
const MAX_KM = 25;
const km = ([a, b], [c, d]) => { const r = Math.PI / 180, h = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const search = async (q) => {
  const res = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" + encodeURIComponent(q),
    { headers: { "User-Agent": "gardencityksevents-map (https://github.com/CaptainTeach123/Gardencityksevents)" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return (await res.json())[0];
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let found = 0;
  for (const [id, v] of Object.entries(venues)) {
    if (id.startsWith("_") || (!all && !v.approx)) continue;
    try {
      const full = /garden city/i.test(v.address) ? v.address : `${v.address}, Garden City, KS`;
      let hit = await search(full);
      if (!hit) { await sleep(1100); hit = await search(`${v.name}, Garden City, KS`); }
      if (hit && km(CENTER, [+hit.lat, +hit.lon]) > MAX_KM) { console.log(`✗ ${id}: match too far from Garden City (${hit.display_name.slice(0, 60)}) — ignored`); hit = null; }
      else if (hit) {
        v.lat = +(+hit.lat).toFixed(5); v.lng = +(+hit.lon).toFixed(5); delete v.approx;
        found++;
        console.log(`✓ ${id}: ${v.lat}, ${v.lng}  (${hit.display_name.slice(0, 70)})`);
      } else console.log(`✗ ${id}: no match for "${v.address}" — fix the address or set lat/lng by hand`);
    } catch (e) { console.log(`✗ ${id}: ${e.message}`); }
    await sleep(1100);
  }
  if (!found) { console.log("\nNothing geocoded (no network access to nominatim.openstreetmap.org?). venues.json left untouched."); return; }
  fs.writeFileSync(file, JSON.stringify(venues, null, 2) + "\n");
  console.log(`\nUpdated ${found} venue(s) in scripts/venues.json. Now run: node scripts/build-events.js`);
})();
