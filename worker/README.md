# muni-walk-ai-search — Cloudflare Worker

Backs the "Find ___ along the route" feature in the main app. Holds the
Anthropic API key server-side (never in browser JS) and does exactly two
things:

1. **`interpret`** — turns a free-text request ("tacos", "historical
   sites") into OpenStreetMap tag filters.
2. **`describe`** — given a batch of already-found places (name + OSM tags),
   writes a short, grounded one-sentence description for each.

It never returns coordinates on its own — those always come straight from
OpenStreetMap's Overpass API, queried directly by the browser. See
`js/app.js` for the client-side pipeline that ties these together.

## Deploy

```sh
cd worker
npm install -g wrangler   # if you don't already have it
wrangler secret put ANTHROPIC_API_KEY   # paste your key when prompted
wrangler deploy
```

Wrangler prints the deployed URL (something like
`https://muni-walk-ai-search.<your-subdomain>.workers.dev`). Copy it into
`AI_PROXY_BASE` near the top of `js/app.js`.

## API

Both endpoints are `POST` with a JSON body and CORS enabled for any origin.

```
POST /
{ "action": "interpret", "query": "tacos" }
->
{ "label": "Taco spots",
  "queries": [[{"key":"amenity","value":"restaurant"},{"key":"cuisine","value":"mexican"}],
              [{"key":"amenity","value":"fast_food"}, {"key":"cuisine","value":"mexican"}]] }
```

```
POST /
{ "action": "describe", "query": "tacos",
  "points": [{"id":"node/123","name":"La Taqueria","tags":{"amenity":"restaurant","cuisine":"mexican"}}] }
->
{ "descriptions": [{"id":"node/123","description":"A neighborhood Mexican restaurant known for tacos."}] }
```
