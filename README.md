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
  plotted on the map, filtered to within 1/4 mile of the route. Tap a pin
  for its name, address, and a short AI-written description.
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
- "Find along the route" combines two data sources: a Cloudflare Worker
  (`worker/`) that holds an Anthropic API key server-side and turns your
  free-text request into OpenStreetMap tag filters (and later writes short
  descriptions of the results), and [OpenStreetMap's Overpass
  API](https://overpass-api.de/), queried directly by the browser, for the
  actual place data — names, coordinates, and addresses. The AI never
  invents a location; it only interprets intent and describes real places
  it's given. Results are filtered client-side to those within 1/4 mile of
  the drawn route line. See `worker/README.md` to deploy it.

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
