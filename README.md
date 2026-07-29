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

## Project structure

```
index.html        Page markup
css/style.css      All styles
js/routes-data.js  Embedded fallback route geometry
js/app.js          App logic (map, GPS, live buses, UI)
```

To run it locally, just serve the directory with any static file server
and open `index.html` in a browser (GPS features require HTTPS or
`localhost`).
