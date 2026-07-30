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
// Deploy:
//   1. npm install -g wrangler   (if you don't have it already)
//   2. wrangler secret put ANTHROPIC_API_KEY     (paste your key when prompted)
//   3. wrangler deploy
//   4. Copy the deployed *.workers.dev URL into AI_PROXY_BASE in js/app.js

const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_POINTS_PER_DESCRIBE = 30;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
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

async function handleInterpret(env, body) {
  const query = String(body.query || "").trim().slice(0, 200);
  if (!query) return jsonResponse({ error: "Missing 'query'" }, 400);

  const result = await callClaude(env, {
    system:
      "You turn a short free-text request (things a pedestrian wants to find along a walking route) into OpenStreetMap tag filters. " +
      "Only use tag keys/values that are real, commonly-used OpenStreetMap tagging. Prefer broad, well-populated tags over obscure ones.",
    userText: `Request: "${query}"`,
    tool: INTERPRET_TOOL,
  });

  return jsonResponse(result);
}

async function handleDescribe(env, body) {
  const query = String(body.query || "").trim().slice(0, 200);
  const points = Array.isArray(body.points) ? body.points.slice(0, MAX_POINTS_PER_DESCRIBE) : [];
  if (!points.length) return jsonResponse({ descriptions: [] });

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

  return jsonResponse(result);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return jsonResponse({ error: "Use POST" }, 405);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return jsonResponse({ error: "Worker is missing the ANTHROPIC_API_KEY secret" }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    try {
      if (body.action === "interpret") return await handleInterpret(env, body);
      if (body.action === "describe") return await handleDescribe(env, body);
      return jsonResponse({ error: "Unknown action; expected 'interpret' or 'describe'" }, 400);
    } catch (e) {
      return jsonResponse({ error: String((e && e.message) || e) }, 502);
    }
  },
};
