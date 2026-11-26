// Test-only stand-in for Supabase Auth and the HemFin API, so Playwright runs without Docker or
// any network. It runs as its own process (see playwright.config.ts) because the Next.js server
// calls the API from the server side, where Playwright's page.route cannot intercept.
//
// The signing key is generated in memory at startup, so no key material exists in the repo.
// Tests ask POST /__test/token for a signed token and put it in the Supabase session cookie.
import { createServer } from "node:http";
import { createHash, generateKeyPairSync, sign, randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_PORT ?? 3199);
const ISSUER = `http://127.0.0.1:${PORT}/auth/v1`;

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const KID = "mock-key-1";
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "ES256", use: "sig" };

const b64u = (buf) => Buffer.from(buf).toString("base64url");

function mintToken(sub, email) {
  const header = b64u(JSON.stringify({ alg: "ES256", typ: "JWT", kid: KID }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64u(
    JSON.stringify({ sub, email, aud: "authenticated", role: "authenticated", iss: ISSUER, iat: now, exp: now + 3600 }),
  );
  const sig = sign("sha256", Buffer.from(`${header}.${payload}`), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64u(sig)}`;
}

/** Stable ids so screenshots and assertions do not depend on randomness. */
const uuidFor = (seed) => {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

function claimsFrom(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  if (!m) return null;
  try {
    return JSON.parse(Buffer.from(m[1].split(".")[1], "base64url").toString());
  } catch {
    return null;
  }
}

// In-memory API state, keyed by user id. Extended by feature tickets (profile, addresses).
export const state = new Map();
function userState(claims) {
  if (!state.has(claims.sub)) {
    state.set(claims.sub, {
      email: claims.email,
      display_name: null,
      profile: { phone_e164: null, base_currency: "EUR", locale: "en", updated_at: null },
      addresses: [],
    });
  }
  return state.get(claims.sub);
}

function meFor(claims) {
  const spaces = [
    {
      id: uuidFor(`personal:${claims.sub}`),
      type: "personal",
      name: "Personal",
      role: "owner",
      created_at: "2026-11-25T10:00:00Z",
    },
  ];
  if (String(claims.email).startsWith("household")) {
    spaces.push({
      id: uuidFor(`household:${claims.sub}`),
      type: "household",
      name: "Smith family",
      role: "admin",
      created_at: "2026-11-25T10:05:00Z",
    });
  }
  return { id: claims.sub, email: claims.email, display_name: userState(claims).display_name, spaces };
}

const routes = [];
/** Feature tickets register extra routes: addRoute(method, regex, async (ctx) => [status, body]). */
export function addRoute(method, pattern, handler) {
  routes.push({ method, pattern, handler });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const problem = (status, detail) => [status, { type: "about:blank", title: String(status), status, detail }, "application/problem+json"];

addRoute("GET", /^\/health$/, async () => [503, { status: "down" }]);
addRoute("GET", /^\/auth\/v1\/\.well-known\/jwks\.json$/, async () => [200, { keys: [jwk] }]);
addRoute("POST", /^\/__test\/token$/, async ({ body }) => {
  const sub = body.sub ?? uuidFor(`user:${body.email}`);
  return [200, { access_token: mintToken(sub, body.email), sub }];
});
addRoute("POST", /^\/__test\/reset$/, async () => {
  state.clear();
  return [204, null];
});
addRoute("POST", /^\/auth\/v1\/token$/, async ({ body }) => {
  // Mock rule: any password is accepted unless it contains "wrong" (no credentials stored anywhere).
  if (!body.email || !body.password || /wrong/i.test(body.password)) {
    return [400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" }];
  }
  const sub = uuidFor(`user:${body.email}`);
  const now = Math.floor(Date.now() / 1000);
  return [
    200,
    {
      access_token: mintToken(sub, body.email),
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: randomUUID(),
      user: { id: sub, aud: "authenticated", role: "authenticated", email: body.email, app_metadata: {}, user_metadata: {}, created_at: "2026-11-25T10:00:00Z" },
    },
  ];
});
addRoute("POST", /^\/auth\/v1\/signup$/, async ({ body }) => [
  200,
  { id: uuidFor(`user:${body.email}`), aud: "authenticated", email: body.email, app_metadata: {}, user_metadata: {}, created_at: "2026-11-25T10:00:00Z" },
]);
addRoute("POST", /^\/auth\/v1\/(recover|resend)$/, async () => [200, {}]);
addRoute("POST", /^\/auth\/v1\/logout$/, async () => [204, null]);
addRoute("GET", /^\/api\/v1\/me$/, async ({ claims }) =>
  claims ? [200, meFor(claims)] : problem(401, "Not authenticated."),
);

// ---- Profile and addresses (HEM-009 API, mirrored closely enough for UI tests) ----------------
const MAX_ADDRESSES = 20;
const validation = (...errors) => [
  422,
  {
    type: "about:blank",
    title: "Validation Error",
    status: 422,
    detail: "Request validation failed.",
    errors: errors.map(([field, msg]) => ({ loc: ["body", field], msg, type: "value_error" })),
  },
  "application/problem+json",
];
const authed = (handler) => async (ctx) => (ctx.claims ? handler(ctx) : problem(401, "Not authenticated."));

const profileOut = (u) => ({ display_name: u.display_name, ...u.profile });
const sortedAddresses = (u) =>
  [...u.addresses].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.created_at.localeCompare(b.created_at));

let addressSeq = 0;
function newAddress(u, data, isDefault) {
  addressSeq += 1;
  const now = new Date(Date.UTC(2026, 10, 26, 10, 0, addressSeq)).toISOString();
  return { id: uuidFor(`address:${addressSeq}:${Math.random()}`), line2: null, region: null, postcode: null, ...data, is_default: isDefault, created_at: now, updated_at: now };
}

const REQUIRED = ["label", "line1", "city", "country"];
function addressErrors(data, partial) {
  const errors = [];
  for (const f of REQUIRED) {
    if (partial && !(f in data)) continue;
    if (typeof data[f] !== "string" || data[f].trim() === "") errors.push([f, "String should have at least 1 character"]);
  }
  // The mock treats XX as the one unknown country, like the API's pycountry check.
  if (typeof data.country === "string" && data.country.trim() !== "" && (data.country.length !== 2 || data.country.toUpperCase() === "XX")) {
    errors.push(["country", "Value error, Must be an ISO 3166-1 alpha-2 country code, for example NL."]);
  }
  return errors;
}

addRoute("GET", /^\/api\/v1\/me\/profile$/, authed(async ({ me }) => [200, profileOut(me)]));
addRoute(
  "PATCH",
  /^\/api\/v1\/me\/profile$/,
  authed(async ({ me, body }) => {
    const errors = [];
    const next = {};
    if ("display_name" in body) {
      const name = body.display_name === null ? null : String(body.display_name).trim();
      if (name !== null && (name === "" || name.length > 80)) errors.push(["display_name", "String should have at most 80 characters"]);
      else next.display_name = name;
    }
    if ("phone_e164" in body) {
      if (body.phone_e164 === null) next.phone_e164 = null;
      else {
        const digits = String(body.phone_e164).replace(/[^\d+]/g, "");
        // Mock rule: "+<country code><6 to 12 digits>", and +99x is not assigned.
        if (!/^\+[1-9]\d{6,14}$/.test(digits) || digits.startsWith("+99")) errors.push(["phone_e164", "Value error, Not a valid phone number."]);
        else next.phone_e164 = digits;
      }
    }
    if ("base_currency" in body) {
      const code = String(body.base_currency ?? "").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(code) || code === "XXQ") errors.push(["base_currency", "Value error, Must be an ISO 4217 currency code, for example EUR."]);
      else next.base_currency = code;
    }
    if ("locale" in body) {
      const tag = String(body.locale ?? "");
      if (!/^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|\d{3}))?$/.test(tag)) errors.push(["locale", "Value error, Must be a BCP-47 language tag, for example en or nl-NL."]);
      else next.locale = tag;
    }
    if (errors.length) return validation(...errors);
    if ("display_name" in next) me.display_name = next.display_name;
    for (const k of ["phone_e164", "base_currency", "locale"]) if (k in next) me.profile[k] = next[k];
    me.profile.updated_at = new Date().toISOString();
    return [200, profileOut(me)];
  }),
);
addRoute("GET", /^\/api\/v1\/me\/addresses$/, authed(async ({ me }) => [200, sortedAddresses(me)]));
addRoute(
  "POST",
  /^\/api\/v1\/me\/addresses$/,
  authed(async ({ me, body }) => {
    const errors = addressErrors(body, false);
    if (errors.length) return validation(...errors);
    if (me.addresses.length >= MAX_ADDRESSES) return problem(409, `At most ${MAX_ADDRESSES} addresses are allowed.`);
    const makeDefault = body.is_default === true || me.addresses.length === 0;
    if (makeDefault) for (const a of me.addresses) a.is_default = false;
    const data = { ...body };
    delete data.is_default;
    const address = newAddress(me, { ...data, country: String(data.country).toUpperCase() }, makeDefault);
    me.addresses.push(address);
    return [201, address];
  }),
);
addRoute(
  "PATCH",
  /^\/api\/v1\/me\/addresses\/([0-9a-f-]+)$/,
  authed(async ({ me, body, match }) => {
    const address = me.addresses.find((a) => a.id === match[1]);
    if (!address) return problem(404, "Address not found.");
    const errors = addressErrors(body, true);
    if (errors.length) return validation(...errors);
    Object.assign(address, body, body.country ? { country: String(body.country).toUpperCase() } : {}, { updated_at: new Date().toISOString() });
    return [200, address];
  }),
);
addRoute(
  "DELETE",
  /^\/api\/v1\/me\/addresses\/([0-9a-f-]+)$/,
  authed(async ({ me, match }) => {
    const i = me.addresses.findIndex((a) => a.id === match[1]);
    if (i < 0) return problem(404, "Address not found.");
    me.addresses.splice(i, 1); // the API does not promote another default
    return [204, null];
  }),
);
addRoute(
  "POST",
  /^\/api\/v1\/me\/addresses\/([0-9a-f-]+)\/default$/,
  authed(async ({ me, match }) => {
    const address = me.addresses.find((a) => a.id === match[1]);
    if (!address) return problem(404, "Address not found.");
    for (const a of me.addresses) a.is_default = false;
    address.is_default = true;
    return [200, address];
  }),
);
// Test helper: seed a user's profile and addresses. Body: {email, display_name?, profile?, addresses?: number | object[]}.
addRoute("POST", /^\/__test\/seed$/, async ({ body }) => {
  const sub = uuidFor(`user:${body.email}`);
  const me = userState({ sub, email: body.email });
  if (body.display_name !== undefined) me.display_name = body.display_name;
  if (body.profile) Object.assign(me.profile, body.profile);
  if (body.addresses !== undefined) {
    const items = typeof body.addresses === "number"
      ? Array.from({ length: body.addresses }, (_, i) => ({ label: `Address ${i + 1}`, line1: `Street ${i + 1}`, city: "Utrecht", country: "NL" }))
      : body.addresses;
    me.addresses = items.map((data, i) => newAddress(me, data, i === 0));
  }
  return [204, null];
});

const server = createServer(async (req, res) => {
  const cors = {
    "access-control-allow-origin": req.headers.origin ?? "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-credentials": "true",
    "access-control-expose-headers": "*",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors).end();
    return;
  }
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
  if (!route) {
    res.writeHead(404, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ detail: "not found" }));
    return;
  }
  const claims = claimsFrom(req);
  const body = req.method === "GET" || req.method === "DELETE" ? {} : await readBody(req);
  const [status, payload, type] = await route.handler({
    req,
    url,
    body,
    claims,
    match: route.pattern.exec(url.pathname),
    me: claims ? userState(claims) : null,
    uuidFor,
  });
  res.writeHead(status, { ...cors, "content-type": type ?? "application/json" });
  res.end(payload === null ? undefined : JSON.stringify(payload));
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock backend on ${PORT}`));
