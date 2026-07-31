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

## Cost controls

The Worker's URL lives in the app's client-side JS, so anyone can find it —
CORS alone doesn't stop a script or `curl` from calling it directly and
running up your Anthropic bill, since CORS only controls what a *browser*
is allowed to read, not what the server processes. Three layers guard
against that:

1. **Origin allowlist** — requests must carry a browser `Origin` header
   matching `ALLOWED_ORIGINS` in `wrangler.toml`. A determined caller can
   spoof this header, so it's a deterrent against casual abuse/scraping,
   not a hard lock.
2. **Per-IP rate limit** — `MAX_REQUESTS_PER_MINUTE_PER_IP` (default 12,
   i.e. about 6 searches/minute since each search makes 2 requests).
3. **Hard daily cap** — `MAX_DAILY_REQUESTS` (default 400, about 200
   searches/day) across all callers combined, so total spend has a ceiling
   no matter how distributed an abuser's requests are.

Both limits are enforced with a Workers KV counter, which is best-effort
(not perfectly atomic under heavy concurrency) — fine for deterring abuse,
not a precise billing meter.

**The real backstop** doesn't live in this Worker at all: set a spend limit
on your [Anthropic Console](https://console.anthropic.com) under Settings →
Billing, so a determined attacker who works around all three layers above
still can't cost you more than you've capped.

## Deploy

```sh
cd worker
npm install -g wrangler   # if you don't already have it
wrangler kv namespace create RATE_LIMIT_KV
# -> paste the printed "id" into the [[kv_namespaces]] block in wrangler.toml
wrangler secret put ANTHROPIC_API_KEY   # paste your Anthropic key when prompted
```

Then edit `wrangler.toml`'s `[vars]` block — in particular make sure
`ALLOWED_ORIGINS` lists every origin the app is actually served from — and:

```sh
wrangler deploy
```

Wrangler prints the deployed URL (something like
`https://muni-walk-ai-search.<your-subdomain>.workers.dev`). Copy it into
`AI_PROXY_BASE` near the top of `js/app.js`.

## API

Both endpoints are `POST` with a JSON body. CORS is restricted to origins
listed in `ALLOWED_ORIGINS`, and every request is rate-limited (see above).

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
