/*
 * Event data for the Garden City, KS event map.
 *
 * ⚠️  SAMPLE DATA — the events below are placeholders so the map has something
 * to show. Replace them with real events. Venue coordinates are approximate;
 * check them (right-click a spot in Google/Apple Maps → copy lat/lng).
 *
 * Times are Garden City local time (Central), written "YYYY-MM-DDTHH:MM".
 * `end` is exclusive: an event is "active" while start <= now < end.
 * Categories are defined in index.html (CATEGORIES).
 */
window.VENUES = {
  downtown: { name: "Downtown Main Street",         lat: 37.9722, lng: -100.8722 },
  finnup:   { name: "Finnup Park",                  lat: 37.9609, lng: -100.8862 },
  zoo:      { name: "Lee Richardson Zoo",           lat: 37.9575, lng: -100.8870 },
  bigpool:  { name: "Big Pool",                     lat: 37.9690, lng: -100.8745 },
  library:  { name: "Finney County Public Library", lat: 37.9700, lng: -100.8650 },
  college:  { name: "Community College Campus",     lat: 37.9915, lng: -100.8730 },
  fair:     { name: "Finney County Fairgrounds",    lat: 37.9570, lng: -100.8420 },
};

window.EVENTS = [
  { title: "Farmers Market",            venue: "downtown", category: "food",      start: "2026-10-10T08:00", end: "2026-10-10T12:00", desc: "Local produce, baked goods and crafts." },
  { title: "Zoo Boo Weekend",           venue: "zoo",      category: "family",    start: "2026-10-10T10:00", end: "2026-10-10T16:00", desc: "Trick-or-treat stations and costume parade." },
  { title: "Downtown Live Music",       venue: "downtown", category: "music",     start: "2026-10-10T18:00", end: "2026-10-10T21:30", desc: "Local bands on the main stage." },
  { title: "Friday Night Football",     venue: "fair",     category: "sports",    start: "2026-10-09T19:00", end: "2026-10-09T22:00", desc: "Home game." },
  { title: "Story Time",                venue: "library",  category: "family",    start: "2026-10-11T14:00", end: "2026-10-11T15:00", desc: "Stories and crafts for ages 3–7." },
  { title: "Sunday Park Yoga",          venue: "finnup",   category: "community", start: "2026-10-11T09:00", end: "2026-10-11T10:00", desc: "Bring a mat. All levels." },
  { title: "Pool Closing Party",        venue: "bigpool",  category: "family",    start: "2026-10-12T12:00", end: "2026-10-12T17:00", desc: "Last splash of the season." },
  { title: "Art Walk",                  venue: "downtown", category: "arts",      start: "2026-10-16T17:00", end: "2026-10-16T20:00", desc: "Galleries and studios open late." },
  { title: "Fall Concert Series",       venue: "college",  category: "music",     start: "2026-10-16T19:30", end: "2026-10-16T21:30", desc: "Student and faculty performances." },
  { title: "Community 5K",              venue: "finnup",   category: "sports",    start: "2026-10-17T08:00", end: "2026-10-17T11:00", desc: "Run or walk the park loop." },
  { title: "Harvest Food Truck Rally",  venue: "fair",     category: "food",      start: "2026-10-17T11:00", end: "2026-10-17T20:00", desc: "Food trucks, lawn games, live DJ." },
  { title: "Author Talk",               venue: "library",  category: "community", start: "2026-10-20T18:30", end: "2026-10-20T20:00", desc: "Reading and Q&A." },
  { title: "Haunted Zoo Night",         venue: "zoo",      category: "family",    start: "2026-10-30T18:00", end: "2026-10-30T21:00", desc: "After-dark family-friendly spooks." },
  { title: "Downtown Trick-or-Treat",   venue: "downtown", category: "family",    start: "2026-10-31T16:00", end: "2026-10-31T19:00", desc: "Candy at participating storefronts." },
];
