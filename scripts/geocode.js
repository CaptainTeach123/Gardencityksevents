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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const [id, v] of Object.entries(venues)) {
    if (id.startsWith("_") || (!all && !v.approx)) continue;
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" + encodeURIComponent(v.address);
    try {
      const res = await fetch(url, { headers: { "User-Agent": "gardencityksevents-map (personal project)" } });
      const hits = await res.json();
      if (hits[0]) {
        v.lat = +(+hits[0].lat).toFixed(5); v.lng = +(+hits[0].lon).toFixed(5); delete v.approx;
        console.log(`✓ ${id}: ${v.lat}, ${v.lng}  (${hits[0].display_name.slice(0, 70)})`);
      } else console.log(`✗ ${id}: no match for "${v.address}" — fix the address or set lat/lng by hand`);
    } catch (e) { console.log(`✗ ${id}: ${e.message}`); }
    await sleep(1100);
  }
  fs.writeFileSync(file, JSON.stringify(venues, null, 2) + "\n");
  console.log("\nSaved scripts/venues.json. Now run: node scripts/build-events.js");
})();
