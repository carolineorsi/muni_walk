# muni-walk-ai-search — Cloudflare Worker

Backs the "Find ___ along the route" feature in the main app. Holds the
Anthropic API key server-side (never in browser JS) and does exactly two
things:

1. **`interpret`** — turns a free-text request ("tacos", "historical
   sites") into OpenStreetMap tag filters. Uses Haiku (`INTERPRET_MODEL` in
   `ai-search-worker.js`) — it's a small, mechanical classification task.
2. **`describe`** — given already-found places (name + OSM tags; the
   endpoint accepts a batch up to 20 but the client only ever calls it with
   one, on demand when someone taps a pin's "Tell me more" button — not
   preemptively for every result), writes a richer 2-3 sentence description
   for each. When the model isn't already confident about a place, it can
   use Anthropic's `web_search` tool to look up real facts about it
   (history, specialty, what it's known for) before writing the
   description. Also runs on Haiku (`DESCRIBE_MODEL`) — the quality jump
   came from `web_search` actually grounding the description, not from a
   stronger model, so it stays on the cheaper tier. Bump `DESCRIBE_MODEL`
   to a Sonnet model id if you want to try trading cost for writing quality
   again.

It never returns coordinates on its own — those always come straight from
OpenStreetMap's Overpass API, queried directly by the browser, and the
client picks which places to describe (and when) before this Worker ever
sees them — a search never adds a new place to the results, only detail to
ones already found. See `js/app.js` for the client-side pipeline that ties
these together.

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

`describe` calls now also cost web searches (billed separately by
Anthropic, on top of normal token costs) whenever the model looks a place
up. `MAX_WEB_SEARCHES_PER_DESCRIBE` in `ai-search-worker.js` caps this at
10 searches per `describe` call — the model skips searching for places it
already knows or that don't need it, so most calls use fewer. Factor that
into your Anthropic Console spend limit (see below) alongside the request
caps above. Using `web_search` also requires that tool be enabled for your
Anthropic API key/org.

**The real backstop** doesn't live in this Worker at all: set a spend limit
on your [Anthropic Console](https://console.anthropic.com) under Settings →
Billing, so a determined attacker who works around all three layers above
still can't cost you more than you've capped.

## Deploy

### One-time setup

```sh
cd worker
npm install -g wrangler   # if you don't already have it
wrangler kv namespace create RATE_LIMIT_KV
# -> paste the printed "id" into the [[kv_namespaces]] block in wrangler.toml
wrangler secret put ANTHROPIC_API_KEY   # paste your Anthropic key when prompted
```

Then edit `wrangler.toml`'s `[vars]` block — in particular make sure
`ALLOWED_ORIGINS` lists every origin the app is actually served from.

### Manual deploy

```sh
wrangler deploy
```

Wrangler prints the deployed URL (something like
`https://muni-walk-ai-search.<your-subdomain>.workers.dev`). Copy it into
`AI_PROXY_BASE` near the top of `js/app.js`.

### Automatic deploy on merge

`.github/workflows/deploy-worker.yml` redeploys the Worker automatically
whenever a change under `worker/` lands on `main` (i.e. when a PR touching
it is merged). It needs two repository secrets set once under
**Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN` — a token scoped to "Edit Cloudflare Workers"
  (Workers Scripts: Edit, Workers KV Storage: Edit) for your account.
- `CLOUDFLARE_ACCOUNT_ID` — found on the Cloudflare dashboard's Workers &
  Pages overview page, right sidebar.

The `ANTHROPIC_API_KEY` secret and the `RATE_LIMIT_KV` namespace are
Worker-side config set once via `wrangler secret put` / `wrangler kv
namespace create` above — the CI job doesn't touch either, it only pushes
code and `wrangler.toml`'s `[vars]`/`[[kv_namespaces]]` binding.

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
{ "descriptions": [{"id":"node/123","description":"A Mission District institution since 1973, La Taqueria is famous for
  its no-rice burritos wrapped in foil and grilled — often cited as some of the best in the city."}] }
```
