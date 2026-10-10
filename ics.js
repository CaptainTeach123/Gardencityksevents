/*
 * iCalendar (.ics) + Google Calendar helpers, shared by the browser (index.html) and
 * the build (scripts/build-events.js, which writes the subscribable garden-city-events.ics feed).
 *
 * Events use Garden City local time as "YYYY-MM-DDTHH:MM" (see events.js).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.IcsExport = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TZID = "America/Chicago";
  const CRLF = "\r\n";

  const esc = (s) => String(s == null ? "" : s)
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

  const bytes = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

  /* RFC 5545: lines are at most 75 octets; continuation lines start with one space. */
  function fold(line) {
    const out = [];
    let cur = "", n = 0;
    for (const ch of line) {                       // iterates by code point, so emoji aren't split
      const b = bytes(ch.codePointAt(0));
      if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; }
      cur += ch; n += b;
    }
    out.push(cur);
    return out.join(CRLF + " ");
  }

  const localStamp = (local) => local.replace(/[-:]/g, "") + "00";   // 2026-10-10T18:00 -> 20261010T180000
  const nowStamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

  const place = (v) => (v ? [v.name, v.address].filter(Boolean).join(", ") : "");
  const dateOnly = (local) => local.slice(0, 10).replace(/-/g, "");                  // 2026-10-10T00:00 -> 20261010
const describe = (e) => [e.open && !e.allDay ? "Start time only; the end time was not published." : "", e.desc || "", e.url || ""]
    .filter(Boolean).join("\n\n");

  function uid(e) {
    const base = String(e.url || e.title).replace(/^https?:\/\/[^/]+/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    return `${base}-${e.start.replace(/\D/g, "")}@gardencityksevents`;
  }

  function vevent(e, v, stamp) {
    const lines = [
      "BEGIN:VEVENT",
      `UID:${uid(e)}`,
      `DTSTAMP:${stamp}`,
      ...(e.allDay
        ? [`DTSTART;VALUE=DATE:${dateOnly(e.start)}`, `DTEND;VALUE=DATE:${dateOnly(e.end)}`]            // all-day: date only, end is exclusive
        : [`DTSTART;TZID=${TZID}:${localStamp(e.start)}`, `DTEND;TZID=${TZID}:${localStamp(e.end)}`]),
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(describe(e))}`,
    ];
    if (v) {
      lines.push(`LOCATION:${esc(place(v))}`);
      if (!v.approx && v.lat != null) lines.push(`GEO:${v.lat};${v.lng}`);
    }
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
    return lines;
  }

  const VTIMEZONE = [
    "BEGIN:VTIMEZONE", `TZID:${TZID}`,
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0600", "TZOFFSETTO:-0500", "TZNAME:CDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0600", "TZNAME:CST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
    "END:VTIMEZONE",
  ];

  /* events: [{title,venue,start,end,url,desc,open}], venues: {id:{name,address,lat,lng,approx}} */
  function build(events, venues, opts) {
    opts = opts || {};
    const stamp = opts.stamp || nowStamp();
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Garden City Events Map//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      `X-WR-CALNAME:${esc(opts.name || "Garden City Events")}`, `X-WR-TIMEZONE:${TZID}`,
      "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
      ...VTIMEZONE,
    ];
    events.forEach((e) => lines.push(...vevent(e, venues[e.venue], stamp)));
    lines.push("END:VCALENDAR");
    return lines.map(fold).join(CRLF) + CRLF;
  }

  /* "Add to Google Calendar" link (opens a pre-filled event form; no sign-in handoff needed). */
  function googleUrl(e, v) {
    const q = new URLSearchParams({
      action: "TEMPLATE", text: e.title, dates: e.allDay ? `${dateOnly(e.start)}/${dateOnly(e.end)}` : `${localStamp(e.start)}/${localStamp(e.end)}`,
      ctz: TZID, details: describe(e), location: place(v),
    });
    return "https://calendar.google.com/calendar/render?" + q.toString();
  }

  return { build, googleUrl, uid, TZID };
});
