#!/usr/bin/env node
// One-off (and re-runnable) generator for js/routes-data.js.
//
// Pulls every current Muni route's shape geometry from SFMTA's "Muni Simple
// Routes" open dataset (data.sfgov.org, id 9exe-acju) — the same dataset and
// query the Cloudflare Worker's `routeShapes` action used to proxy live at
// runtime — and writes it out as a plain JS object literal so the app can
// load all routes from code instead of fetching them on demand.
//
// Usage: node scripts/fetch-routes-data.mjs > js/routes-data.js
//
// Requires network access to data.sfgov.org (this sandbox's egress policy
// blocks that host, which is why this runs in CI instead — see the
// fetch-routes-data workflow).

const ROUTE_SHAPES_ENDPOINT = "https://data.sfgov.org/resource/9exe-acju.json";

// Every current Muni line, kept in sync with FALLBACK_ROUTES in js/app.js.
const ROUTES = [
  "1", "1X", "2", "3", "5", "5R", "6", "7", "7X", "8", "8AX", "8BX", "9", "9R",
  "10", "12", "14", "14R", "14X", "15", "18", "19", "21", "22", "23", "24",
  "25", "27", "28", "28R", "29", "30", "31", "33", "35", "36", "37", "38",
  "38R", "39", "43", "44", "45", "48", "49", "52", "54", "55", "56", "57",
  "58", "66", "67", "714", "J", "KBUS", "L", "M", "MBUS", "N", "NBUS", "T",
  "TBUS",
];

async function fetchRouteShapeRows(routeName, filterFull) {
  const url = ROUTE_SHAPES_ENDPOINT + "?route_name=" + encodeURIComponent(routeName) +
    (filterFull ? "&pattern_type=F" : "") + "&$limit=50";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SFMTA feed error ${res.status} for route ${routeName}`);
  return res.json();
}

async function fetchShapesForRoute(routeName) {
  // pattern_type=F ("full length pattern") is the standard case per the
  // dataset's own docs, but a handful of routes (rail-replacement shuttles,
  // tripper-only services like 714) aren't tagged that way and come back
  // empty under that filter even though SFMTA still publishes a shape for
  // them. Retry once without it before giving up.
  let rows = await fetchRouteShapeRows(routeName, true);
  if (!rows.length) rows = await fetchRouteShapeRows(routeName, false);

  const seenDir = {};
  const shapes = {};
  rows.forEach((row) => {
    const dir = row.direction; // 'I' or 'O'
    if (seenDir[dir]) return; // keep first full pattern per direction to avoid overlapping dupes
    seenDir[dir] = true;
    shapes[dir] = row.shape;
  });
  return shapes;
}

function formatEntry(routeName, shapes) {
  const dirs = Object.keys(shapes);
  const parts = dirs.map((dir) => `${dir}:${JSON.stringify(shapes[dir])}`);
  return `    ${JSON.stringify(routeName)}: { ${parts.join(", ")} }`;
}

async function main() {
  const entries = [];
  const missing = [];

  for (const routeName of ROUTES) {
    let shapes;
    try {
      shapes = await fetchShapesForRoute(routeName);
    } catch (e) {
      console.error(`[fetch-routes-data] ${routeName}: ${e.message}`);
      shapes = {};
    }
    if (!Object.keys(shapes).length) {
      missing.push(routeName);
      console.error(`[fetch-routes-data] ${routeName}: no shapes found`);
      continue;
    }
    entries.push(formatEntry(routeName, shapes));
  }

  const header = `// Verbatim MULTILINESTRING geometry pulled from SFMTA's "Muni Simple Routes" open
// dataset (data.sfgov.org, id 9exe-acju). Embedded directly so the app always loads
// routes from code instead of fetching them live — see scripts/fetch-routes-data.mjs
// to regenerate this file.
  const EMBEDDED_ROUTES = {
${entries.join(",\n")}
  };
`;

  process.stdout.write(header);

  if (missing.length) {
    console.error(`[fetch-routes-data] ${missing.length} route(s) had no shape data: ${missing.join(", ")}`);
  } else {
    console.error(`[fetch-routes-data] all ${ROUTES.length} routes fetched successfully`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
