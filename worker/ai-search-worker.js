// Muni Walker — "Find ___ along the route" AI search proxy.
//
// This Cloudflare Worker is the only piece of the AI point-search feature
// that needs a secret API key, so it lives server-side, same pattern as the
// muni-511-proxy Worker that already fronts 511.org for this app.
//
// It never looks up real places itself — it only turns natural-language
// input into structured search parameters (and, separately, writes short
// descriptions from tag data the client already fetched from OpenStreetMap).
// Actual coordinates/addresses always come from OpenStreetMap's Overpass
// API, called directly by the browser — this worker is not in that path,
// so it can't hallucinate a location.
//
// Endpoints (both POST, JSON body):
//
//   { action: "interpret", query: "tacos" }
//     -> { label, queries: [[{key,value}, ...], ...] }
//     `queries` is an OR of AND-groups of OSM tag filters, e.g.
//     [[{key:"amenity",value:"restaurant"},{key:"cuisine",value:"mexican"}],
//      [{key:"amenity",value:"fast_food"}, {key:"cuisine",value:"mexican"}]]
//
//   { action: "describe", query: "tacos", points: [{id, name, tags}, ...] }
//     -> { descriptions: [{id, description}, ...] }
//     `points` should be capped client-side (<=30) — each one costs tokens.
//
// Cost controls: only the app's own origin may call this (checked against
// the ALLOWED_ORIGINS var below), and every request is rate-limited both
// per-IP and with a hard daily global cap (via the RATE_LIMIT_KV binding)
// so a scraper that finds this URL and calls it directly — bypassing the
// browser and any CORS check entirely — still can't run up an unbounded
// bill. Also set a spend limit on the Anthropic Console itself as a backstop
// that doesn't depend on this Worker's logic at all. See README.md.
//
// Deploy:
//   1. npm install -g wrangler   (if you don't have it already)
//   2. wrangler kv namespace create RATE_LIMIT_KV
//      -> paste the returned id into the [[kv_namespaces]] block in wrangler.toml
//   3. wrangler secret put ANTHROPIC_API_KEY     (paste your key when prompted)
//   4. Edit the [vars] block in wrangler.toml: ALLOWED_ORIGINS should list
//      every origin this Worker should accept calls from (comma-separated).
//   5. wrangler deploy
//   6. Copy the deployed *.workers.dev URL into AI_PROXY_BASE in js/app.js

const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_POINTS_PER_DESCRIBE = 30;
const DEFAULT_MAX_REQUESTS_PER_MINUTE_PER_IP = 12;
const DEFAULT_MAX_DAILY_REQUESTS = 400;

function parseAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeadersFor(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function jsonResponse(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
  });
}

// Best-effort — Workers KV reads/writes aren't atomic, so under heavy
// concurrent abuse a few requests could slip past the exact limit. That's
// fine here: this is a deterrent against runaway cost, not a precise
// billing meter (the real backstop is the spend limit on the Anthropic
// Console — see README.md).
async function checkAndIncrementRateLimit(env, request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const minuteBucket = Math.floor(now / 60000);
  const ipKey = `ip:${ip}:${minuteBucket}`;
  const dayBucket = new Date(now).toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const globalKey = `global:${dayBucket}`;

  const [ipCountStr, globalCountStr] = await Promise.all([
    env.RATE_LIMIT_KV.get(ipKey),
    env.RATE_LIMIT_KV.get(globalKey),
  ]);
  const ipCount = parseInt(ipCountStr || "0", 10);
  const globalCount = parseInt(globalCountStr || "0", 10);

  const maxPerIp = parseInt(env.MAX_REQUESTS_PER_MINUTE_PER_IP, 10) || DEFAULT_MAX_REQUESTS_PER_MINUTE_PER_IP;
  const maxGlobal = parseInt(env.MAX_DAILY_REQUESTS, 10) || DEFAULT_MAX_DAILY_REQUESTS;

  if (globalCount >= maxGlobal) {
    return { ok: false, reason: "This app's daily AI search limit has been reached — try again tomorrow." };
  }
  if (ipCount >= maxPerIp) {
    return { ok: false, reason: "Too many searches — wait a minute and try again." };
  }

  await Promise.all([
    env.RATE_LIMIT_KV.put(ipKey, String(ipCount + 1), { expirationTtl: 120 }),
    env.RATE_LIMIT_KV.put(globalKey, String(globalCount + 1), { expirationTtl: 90000 }),
  ]);

  return { ok: true };
}

const TAG_FILTER_SCHEMA = {
  type: "object",
  properties: {
    key: { type: "string", description: "OpenStreetMap tag key, e.g. 'amenity', 'shop', 'tourism', 'historic', 'leisure'." },
    value: { type: "string", description: "Tag value to match, e.g. 'restaurant', 'cafe', 'bakery'. Use '*' to match any value for that key." },
  },
  required: ["key", "value"],
  additionalProperties: false,
};

const INTERPRET_TOOL = {
  name: "emit_search_plan",
  description: "Translate a free-text request for points of interest into OpenStreetMap tag filters.",
  input_schema: {
    type: "object",
    properties: {
      label: { type: "string", description: "Short human-readable label for the search, e.g. 'Taco spots' or 'Historical sites'." },
      queries: {
        type: "array",
        description:
          "OR of AND-groups of OSM tag filters. Each inner array is a set of tag conditions that must ALL match (AND); a place matching ANY of the outer groups is included. Keep to 1-4 groups, 1-3 tags per group. Use well-known OpenStreetMap tagging (amenity=restaurant, shop=bakery, tourism=museum, historic=monument, leisure=park, etc).",
        items: { type: "array", items: TAG_FILTER_SCHEMA, minItems: 1, maxItems: 3 },
        minItems: 1,
        maxItems: 4,
      },
    },
    required: ["label", "queries"],
    additionalProperties: false,
  },
};

const DESCRIBE_TOOL = {
  name: "emit_descriptions",
  description: "Write a one-sentence description for each point of interest, grounded only in the tag data provided.",
  input_schema: {
    type: "object",
    properties: {
      descriptions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            description: { type: "string", description: "One brief, plain sentence (<=140 chars). Base it only on the given name/tags — never invent facts, ratings, or hours." },
          },
          required: ["id", "description"],
          additionalProperties: false,
        },
      },
    },
    required: ["descriptions"],
    additionalProperties: false,
  },
};

async function callClaude(env, { system, userText, tool }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userText }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const toolUse = (data.content || []).find((b) => b.type === "tool_use" && b.name === tool.name);
  if (!toolUse) throw new Error("Model did not return the expected tool call");
  return toolUse.input;
}

async function handleInterpret(env, body, corsHeaders) {
  const query = String(body.query || "").trim().slice(0, 200);
  if (!query) return jsonResponse({ error: "Missing 'query'" }, 400, corsHeaders);

  const result = await callClaude(env, {
    system:
      "You turn a short free-text request (things a pedestrian wants to find along a walking route) into OpenStreetMap tag filters. " +
      "Only use tag keys/values that are real, commonly-used OpenStreetMap tagging. Prefer broad, well-populated tags over obscure ones.",
    userText: `Request: "${query}"`,
    tool: INTERPRET_TOOL,
  });

  return jsonResponse(result, 200, corsHeaders);
}

async function handleDescribe(env, body, corsHeaders) {
  const query = String(body.query || "").trim().slice(0, 200);
  const points = Array.isArray(body.points) ? body.points.slice(0, MAX_POINTS_PER_DESCRIBE) : [];
  if (!points.length) return jsonResponse({ descriptions: [] }, 200, corsHeaders);

  const pointsForModel = points.map((p) => ({
    id: String(p.id),
    name: p.name || null,
    tags: p.tags || {},
  }));

  const result = await callClaude(env, {
    system:
      "You write short, factual one-sentence descriptions of places for a walking-tour app, based ONLY on the OpenStreetMap " +
      "name/tags given to you. Never invent details (no made-up hours, ratings, prices, or history) beyond what the tags imply. " +
      "If tags are sparse, write a plain sentence describing the category, e.g. 'A neighborhood cafe.'",
    userText:
      `The user searched for: "${query}"\n\n` +
      `Places (JSON):\n${JSON.stringify(pointsForModel)}\n\n` +
      `Write one description per id.`,
    tool: DESCRIBE_TOOL,
  });

  return jsonResponse(result, 200, corsHeaders);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const originOk = !!origin && parseAllowedOrigins(env).includes(origin);

    if (request.method === "OPTIONS") {
      // Preflight: only hand back CORS headers (which is what lets the
      // browser proceed with the real request) for an allowed origin.
      return originOk ? new Response(null, { headers: corsHeadersFor(origin) }) : new Response(null, { status: 403 });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "Use POST" }, 405, originOk ? corsHeadersFor(origin) : {});
    }
    // No CORS headers on a rejected origin: a browser from elsewhere can't
    // read this response anyway, and there's no reason to hand back
    // permissive headers to a non-browser caller either.
    if (!originOk) {
      return jsonResponse({ error: "Origin not allowed" }, 403, {});
    }
    if (!env.ANTHROPIC_API_KEY) {
      return jsonResponse({ error: "Worker is missing the ANTHROPIC_API_KEY secret" }, 500, corsHeadersFor(origin));
    }
    if (!env.RATE_LIMIT_KV) {
      return jsonResponse({ error: "Worker is missing the RATE_LIMIT_KV binding" }, 500, corsHeadersFor(origin));
    }

    const rl = await checkAndIncrementRateLimit(env, request);
    if (!rl.ok) {
      return jsonResponse({ error: rl.reason }, 429, corsHeadersFor(origin));
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeadersFor(origin));
    }

    try {
      if (body.action === "interpret") return await handleInterpret(env, body, corsHeadersFor(origin));
      if (body.action === "describe") return await handleDescribe(env, body, corsHeadersFor(origin));
      return jsonResponse({ error: "Unknown action; expected 'interpret' or 'describe'" }, 400, corsHeadersFor(origin));
    } catch (e) {
      return jsonResponse({ error: String((e && e.message) || e) }, 502, corsHeadersFor(origin));
    }
  },
};
