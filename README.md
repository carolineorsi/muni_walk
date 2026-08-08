# Muni Walker — Follow the Line

A single-page web app for walking (or tracking) a San Francisco Muni bus
route on foot. Pick a route, and it draws the line on a map, follows your
GPS position against it, and shows live buses running that route.

## Features

- **Route picker** — choose any Muni line; the route's inbound and outbound
  paths are drawn on the map, with directional arrows along the line.
- **Route shapes always available** — route geometry is embedded directly
  in the app (pulled from SFMTA's public "Muni Simple Routes" dataset), so
  the map still works even if the live data feed is unreachable.
- **GPS tracking** — tap the compass button to follow your location. The
  app reports your distance to the nearest point on the route and, once
  you're near it, your progress walked along the route.
- **Live buses** — toggle live tracking to see real-time vehicle positions
  for the selected route and direction, plus the next predicted arrival at
  your nearest stop.
- **Find along the route** — type a free-text request ("restaurants",
  "historical sites", "cozy coffee shops") and get points of interest
  plotted on the map, filtered to within 1/4 mile of the route (and, once
  your GPS position is known, only the places still ahead of you in the
  selected direction) and ranked by visitor rating (when OpenStreetMap has
  one) and closeness to the route, capped at the top 20. Tap a pin for its
  name and address, then tap "Tell me more" for an AI-written description —
  written on demand rather than for every pin up front, and the AI looks
  the place up when that's useful so it covers more than just its OSM
  category.
- **Basemap switcher** — choose between dark, light, streets, and satellite
  map styles.

## How it works

The app is a static site — no build step, no backend of its own.

- Map rendering uses [Leaflet](https://leafletjs.com/).
- Route shapes come from SFMTA's open data (`data.sfgov.org`), with an
  embedded fallback copy baked into the app.
- Live vehicle positions and stop arrival predictions come from
  [511.org](https://511.org)'s Transit API, proxied through a small
  Cloudflare Worker that keeps the API key server-side.
- "Find along the route" combines a Cloudflare Worker with two open,
  keyless place-data sources: the Worker (`worker/`) holds an Anthropic API
  key server-side and turns your free-text request into OpenStreetMap tag
  filters (and, on request, writes a richer description of a single
  result, looking it up on the web when it helps); [OpenStreetMap's
  Overpass API](https://overpass-api.de/), queried directly by the
  browser, supplies the actual place data — names, coordinates, and
  addresses. For historical-type searches specifically, the browser also
  queries [Wikipedia's geosearch
  API](https://www.mediawiki.org/wiki/API:Geosearch) directly over the
  same area and merges in any nearby articles OSM doesn't have tagged
  (deduplicated against OSM results already linked to the same article) —
  OSM's `historic=*` tagging in SF leans heavily toward monuments and
  plaques, so this fills in richer sites like historic buildings and
  landmarks that only Wikipedia has written up. The AI never invents a
  location; it only interprets intent and describes real places it's
  given. Results are filtered client-side to those within 1/4 mile of the
  drawn route line — and, once your GPS position is known, to the active
  direction's line and only points still ahead of you on it — then ranked
  by visitor rating (if OSM has one) and closeness to the route, capped to
  the top 20. Descriptions aren't written up front for every result;
  tapping a pin's "Tell me more" button fetches one just for that place —
  Wikipedia-sourced results already carry their own summary, so they skip
  straight to showing it. See `worker/README.md` to deploy the Worker.

## Project structure

```
index.html                  Page markup
css/style.css                All styles
js/routes-data.js            Embedded fallback route geometry
js/app.js                    App logic (map, GPS, live buses, POI search, UI)
worker/ai-search-worker.js   Cloudflare Worker for the "Find along the route" AI proxy
worker/wrangler.toml         Worker deploy config
worker/README.md             Worker deploy instructions
```

To run it locally, just serve the directory with any static file server
and open `index.html` in a browser (GPS features require HTTPS or
`localhost`).
