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
  return { id: claims.sub, email: claims.email, display_name: null, spaces };
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
