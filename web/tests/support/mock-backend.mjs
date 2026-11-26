// Test-only stand-in for Supabase Auth and the HemFin API, so Playwright runs without Docker or
// any network. It runs as its own process (see playwright.config.ts) because the Next.js server
// calls the API from the server side, where Playwright's page.route cannot intercept.
//
// The signing key is generated in memory at startup, so no key material exists in the repo.
// Tests ask POST /__test/token for a signed token and put it in the Supabase session cookie.
import { createServer } from "node:http";
import { createHash, generateKeyPairSync, sign, randomUUID, randomBytes } from "node:crypto";

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

// ---- Spaces and members (HEM-012 API, mirrored closely enough for UI tests) --------------------
// Every space, personal or household, lives here with its members. A user's spaces are the ones
// that list them as a member, so tests can sign in as several members of one household.
export const spaces = new Map();
const RANK = { owner: 3, admin: 2, member: 1 };
const MAX_OWNED = 10;
const userIdOf = (email) => uuidFor(`user:${email}`);

function ensureSpaces(claims) {
  const u = userState(claims);
  const personalId = uuidFor(`personal:${claims.sub}`);
  if (!spaces.has(personalId)) {
    spaces.set(personalId, {
      id: personalId,
      type: "personal",
      name: "Personal",
      created_at: "2026-11-25T10:00:00Z",
      members: [{ user_id: claims.sub, email: claims.email, display_name: u.display_name, role: "owner", joined_at: "2026-11-25T10:00:00Z" }],
    });
  }
  // Users named household* start with one household they administer (the earlier shell tests rely on it).
  if (String(claims.email).startsWith("household") && !u.smith_seeded) {
    u.smith_seeded = true;
    const ownerEmail = "casey.owner@example.test";
    spaces.set(uuidFor(`household:${claims.sub}`), {
      id: uuidFor(`household:${claims.sub}`),
      type: "household",
      name: "Smith family",
      created_at: "2026-11-25T10:05:00Z",
      members: [
        { user_id: userIdOf(ownerEmail), email: ownerEmail, display_name: "Casey Owner", role: "owner", joined_at: "2026-11-25T10:05:00Z" },
        { user_id: claims.sub, email: claims.email, display_name: u.display_name, role: "admin", joined_at: "2026-11-26T09:00:00Z" },
      ],
    });
  }
}

const roleIn = (space, userId) => space.members.find((m) => m.user_id === userId)?.role;
const spaceOut = (space, role) => ({ id: space.id, type: space.type, name: space.name, role, created_at: space.created_at });

function spacesOf(claims) {
  ensureSpaces(claims);
  return [...spaces.values()]
    .filter((s) => roleIn(s, claims.sub))
    .sort((a, b) => (a.type === b.type ? a.created_at.localeCompare(b.created_at) : a.type === "personal" ? -1 : 1));
}

function meFor(claims) {
  const list = spacesOf(claims).map((s) => spaceOut(s, roleIn(s, claims.sub)));
  return { id: claims.sub, email: claims.email, display_name: userState(claims).display_name, spaces: list };
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
  spaces.clear();
  invitations.clear();
  TOKEN_TO_INVITATION.clear();
  leaks.length = 0;
  return [204, null];
});
addRoute("POST", /^\/auth\/v1\/token$/, async ({ body }) => {
  // PKCE exchange (the /auth/callback route after an email confirmation or Google sign-in). Mock rule: the
  // code is "mock-code-" plus the base64url email (see mockAuthCode in tests/support/auth.ts); the code
  // verifier is accepted as long as the browser sent one.
  const code = typeof body.auth_code === "string" ? /^mock-code-(.+)$/.exec(body.auth_code) : null;
  if (body.auth_code !== undefined) {
    if (!code || !body.code_verifier) return [400, { code: "bad_code_verifier", error_code: "bad_code_verifier", msg: "invalid flow state" }];
    body = { email: Buffer.from(code[1], "base64url").toString(), password: "from-code" };
  }
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
  !claims ? problem(401, "Not authenticated.") : userState(claims).fail_me ? [500, { type: "about:blank", title: "Internal Server Error", status: 500 }, "application/problem+json"] : [200, meFor(claims)],
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

// ---- Households and members routes -------------------------------------------------------------
const serverError = () => [500, { type: "about:blank", title: "Internal Server Error", status: 500 }, "application/problem+json"];

/** A page of `items` with an opaque cursor (the offset), like the API's cursor pagination. */
function pageOf(items, url) {
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
  const cursor = url.searchParams.get("cursor");
  const offset = cursor ? Number(Buffer.from(cursor, "base64url").toString()) : 0;
  const slice = items.slice(offset, offset + limit);
  const next = offset + limit < items.length ? Buffer.from(String(offset + limit)).toString("base64url") : null;
  return { items: slice, next_cursor: next };
}

/** Route wrapper: a non-member (or unknown id) gets 404, a member below `minRole` gets 403. */
const inSpace = (minRole, handler) =>
  authed(async (ctx) => {
    const space = spaces.get(ctx.match[1]);
    const role = space ? roleIn(space, ctx.claims.sub) : undefined;
    if (!space || !role) return problem(404, "Space not found.");
    if (RANK[role] < RANK[minRole]) return problem(403, "Insufficient role for this action.");
    return handler({ ...ctx, space, role });
  });

const ownedHouseholds = (userId) => [...spaces.values()].filter((s) => s.type === "household" && roleIn(s, userId) === "owner").length;
const nameErrors = (body) => {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  return name === "" || [...name].length > 80 ? [["name", "String should have between 1 and 80 characters"]] : [];
};

addRoute(
  "GET",
  /^\/api\/v1\/spaces$/,
  authed(async ({ claims, url, me }) => {
    if (me.fail_spaces) return serverError();
    const items = spacesOf(claims).map((s) => ({ ...spaceOut(s, roleIn(s, claims.sub)), member_count: s.members.length }));
    return [200, pageOf(items, url)];
  }),
);
addRoute(
  "POST",
  /^\/api\/v1\/spaces$/,
  authed(async ({ claims, body, me }) => {
    ensureSpaces(claims);
    const errors = nameErrors(body);
    if (errors.length) return validation(...errors);
    if (ownedHouseholds(claims.sub) >= MAX_OWNED) return problem(409, `At most ${MAX_OWNED} households are allowed.`);
    me.created = (me.created ?? 0) + 1;
    const id = uuidFor(`created:${claims.sub}:${me.created}:${Math.random()}`);
    const now = new Date().toISOString();
    const space = {
      id,
      type: "household",
      name: body.name.trim(),
      created_at: now,
      members: [{ user_id: claims.sub, email: claims.email, display_name: me.display_name, role: "owner", joined_at: now }],
    };
    spaces.set(id, space);
    return [201, spaceOut(space, "owner")];
  }),
);
addRoute("GET", /^\/api\/v1\/spaces\/([^/]+)$/, inSpace("member", async ({ space, role }) => [200, spaceOut(space, role)]));
addRoute(
  "PATCH",
  /^\/api\/v1\/spaces\/([^/]+)$/,
  inSpace("admin", async ({ space, role, body }) => {
    const errors = nameErrors(body);
    if (errors.length) return validation(...errors);
    if (space.type !== "household") return problem(409, "A personal space cannot be renamed.");
    space.name = body.name.trim();
    return [200, spaceOut(space, role)];
  }),
);
addRoute(
  "DELETE",
  /^\/api\/v1\/spaces\/([^/]+)$/,
  inSpace("owner", async ({ space }) => {
    if (space.type !== "household") return problem(409, "A personal space cannot be deleted.");
    spaces.delete(space.id);
    return [204, null];
  }),
);
addRoute(
  "GET",
  /^\/api\/v1\/spaces\/([^/]+)\/members$/,
  inSpace("member", async ({ space, url, me }) => {
    if (me.fail_members) return serverError();
    return [200, pageOf([...space.members].sort((a, b) => a.joined_at.localeCompare(b.joined_at)), url)];
  }),
);
addRoute(
  "PATCH",
  /^\/api\/v1\/spaces\/([^/]+)\/members\/([^/]+)$/,
  inSpace("owner", async ({ space, body, match }) => {
    if (!["owner", "admin", "member"].includes(body.role)) return validation(["role", "Input should be 'owner', 'admin' or 'member'"]);
    if (body.role === "owner") return problem(422, "Use transfer-ownership to change the owner.");
    const target = space.members.find((m) => m.user_id === match[2]);
    if (!target) return problem(404, "Member not found.");
    if (target.role === "owner") return problem(409, "The owner's role changes only by transferring ownership.");
    target.role = body.role;
    return [204, null];
  }),
);
addRoute(
  "DELETE",
  /^\/api\/v1\/spaces\/([^/]+)\/members\/([^/]+)$/,
  inSpace("member", async ({ space, role, claims, match }) => {
    const target = space.members.find((m) => m.user_id === match[2]);
    if (!target) return problem(404, "Member not found.");
    if (target.user_id === claims.sub) {
      if (role === "owner") return problem(409, "Transfer ownership before leaving.");
    } else if (RANK[role] < RANK.admin || (role === "admin" && RANK[target.role] >= RANK.admin)) {
      return problem(403, "Insufficient role for this action.");
    }
    space.members = space.members.filter((m) => m !== target);
    return [204, null];
  }),
);
addRoute(
  "POST",
  /^\/api\/v1\/spaces\/([^/]+)\/transfer-ownership$/,
  inSpace("owner", async ({ space, claims, body }) => {
    if (space.type !== "household") return problem(409, "A personal space cannot be transferred.");
    if (body.user_id === claims.sub) return problem(409, "You already own this household.");
    const target = space.members.find((m) => m.user_id === body.user_id);
    if (!target) return problem(404, "Member not found.");
    if (ownedHouseholds(target.user_id) >= MAX_OWNED) return problem(409, "That member already owns the maximum of 10 households.");
    space.members.find((m) => m.user_id === claims.sub).role = "admin";
    target.role = "owner";
    return [204, null];
  }),
);

// ---- Invitations (HEM-013 API, mirrored closely enough for UI tests) ----------------------------
// Rules mirrored from api/src/hemfin/modules/invitations: admins and owners manage them; the token is
// returned nowhere (the "email" is the test helper's return value); resend has a 60 s cooldown after the
// last email and a cap of 3 a day (429 with Retry-After); a create or resend can answer 503
// `email_not_sent` after saving; and every invitee-side failure (unknown, expired, revoked, used or not
// for you) is the same generic 404.
export const invitations = new Map();
const TOKEN_TO_INVITATION = new Map();
const RESEND_COOLDOWN_S = 60;
const RESEND_CAP = 3;
const DAY_MS = 24 * 3600 * 1000;
let lastStamp = 0;
/** Strictly increasing timestamps, so "newest first" is stable even for rows made in the same millisecond. */
const stamp = () => (lastStamp = Math.max(lastStamp + 1, Date.now()));
const newToken = () => randomBytes(32).toString("base64url");

// Requests that carried a known invitation token anywhere except the JSON body (the URL or any header,
// including Referer). Tests read this to prove the token never leaves the browser in a place a log could keep.
const leaks = [];
function checkLeak(req, url) {
  if (TOKEN_TO_INVITATION.size === 0) return;
  const haystack = `${req.url}\n${JSON.stringify(req.headers)}`;
  for (const token of TOKEN_TO_INVITATION.keys()) {
    if (haystack.includes(token)) leaks.push({ method: req.method, path: url.pathname, token });
  }
}

const invitationOut = (i) => ({
  id: i.id,
  email: i.email,
  role: i.role,
  status: i.status,
  created_at: new Date(i.created_at).toISOString(),
  expires_at: new Date(i.expires_at).toISOString(),
  responded_at: i.responded_at ? new Date(i.responded_at).toISOString() : null,
  invited_by: i.invited_by,
});
const coded = (status, code, detail, headers) => [
  status,
  { type: `urn:hemfin:problem:${code}`, title: String(status), status, detail, code },
  "application/problem+json",
  headers,
];
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function makeInvitation(space, { email, role = "member", invited_by, status = "pending", expires_at, responded_at = null, created_at, last_sent_at, resend_count = 0 }) {
  const now = stamp();
  const inv = {
    id: uuidFor(`invitation:${space.id}:${email}:${now}`),
    space_id: space.id,
    email: email.trim().toLowerCase(),
    role,
    status,
    token: newToken(),
    created_at: created_at ?? now,
    expires_at: expires_at ?? (status === "expired" ? now - 2 * DAY_MS : now + 7 * DAY_MS),
    responded_at,
    invited_by,
    // Seeded rows were "sent" an hour ago, so Resend works at once; a row made through the API is cooling down.
    last_sent_at: last_sent_at ?? now - 3600 * 1000,
    resend_count,
    window_start: resend_count > 0 ? now - 3600 * 1000 : null,
  };
  invitations.set(inv.id, inv);
  TOKEN_TO_INVITATION.set(inv.token, inv.id);
  return inv;
}

/** Retry-After seconds, or null when a resend is allowed (the API's rule: 60 s cooldown, 3 a day). */
function retryAfter(inv, now) {
  const windowOpen = inv.window_start !== null && now - inv.window_start < DAY_MS;
  if (windowOpen && inv.resend_count >= RESEND_CAP) return Math.ceil((inv.window_start + DAY_MS - now) / 1000);
  const wait = Math.ceil((inv.last_sent_at + RESEND_COOLDOWN_S * 1000 - now) / 1000);
  return wait > 0 ? wait : null;
}

addRoute(
  "GET",
  /^\/api\/v1\/spaces\/([^/]+)\/invitations$/,
  inSpace("admin", async ({ space, url, me }) => {
    if (me.fail_invitations_list) return serverError();
    const list = [...invitations.values()].filter((i) => i.space_id === space.id).sort((a, b) => b.created_at - a.created_at);
    return [200, pageOf(list.map(invitationOut), url)];
  }),
);
addRoute(
  "POST",
  /^\/api\/v1\/spaces\/([^/]+)\/invitations$/,
  inSpace("admin", async ({ space, claims, body, me }) => {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_OK.test(email)) return validation(["email", "value is not a valid email address"]);
    if (!["admin", "member"].includes(body.role ?? "member")) return validation(["role", "Input should be 'admin' or 'member'"]);
    if (me.email_mode === "unconfigured") return problem(503, "Email sending is not configured.");
    if (space.members.some((m) => m.email.toLowerCase() === email)) return coded(409, "already_member", "That person is already a member of this household.");
    if ([...invitations.values()].some((i) => i.space_id === space.id && i.email === email && i.status === "pending")) {
      return coded(409, "already_invited", "An invitation is already pending for that email.");
    }
    const inv = makeInvitation(space, { email, role: body.role ?? "member", invited_by: claims.sub, last_sent_at: Date.now() });
    if (me.email_mode === "not_sent") {
      inv.last_sent_at = Date.now() - 3600 * 1000; // the cooldown is undone, so Resend works at once
      return coded(503, "email_not_sent", "The invitation was saved but the email could not be sent. Use resend to try again.");
    }
    return [201, invitationOut(inv)];
  }),
);
/** Lock-and-check shared by resend and revoke: 404 unknown, 409 once it is final. */
const actionable = (space, id) => {
  const inv = invitations.get(id);
  if (!inv || inv.space_id !== space.id) return { error: problem(404, "Invitation not found.") };
  if (inv.status !== "pending" && inv.status !== "expired") return { error: problem(409, "That invitation is no longer pending.") };
  return { inv };
};
addRoute(
  "POST",
  /^\/api\/v1\/spaces\/([^/]+)\/invitations\/([^/]+)\/resend$/,
  inSpace("admin", async ({ space, match, me }) => {
    if (me.email_mode === "unconfigured") return problem(503, "Email sending is not configured.");
    const { inv, error } = actionable(space, match[2]);
    if (error) return error;
    const now = Date.now();
    const wait = retryAfter(inv, now);
    if (wait !== null) return coded(429, "resend_limited", "Too many resends for this invitation. Try again later.", { "Retry-After": String(wait) });
    const before = { last_sent_at: inv.last_sent_at, resend_count: inv.resend_count, window_start: inv.window_start };
    TOKEN_TO_INVITATION.delete(inv.token);
    inv.token = newToken();
    TOKEN_TO_INVITATION.set(inv.token, inv.id);
    inv.status = "pending";
    inv.responded_at = null;
    inv.expires_at = now + 7 * DAY_MS;
    if (inv.window_start === null || now - inv.window_start >= DAY_MS) {
      inv.window_start = now;
      inv.resend_count = 0;
    }
    inv.resend_count += 1;
    inv.last_sent_at = now;
    if (me.email_mode === "not_sent") {
      // Saved, but the email failed: the cooldown is undone so Resend is available at once.
      Object.assign(inv, before);
      return coded(503, "email_not_sent", "The invitation was saved but the email could not be sent. Use resend to try again.");
    }
    return [200, invitationOut(inv)];
  }),
);
addRoute(
  "DELETE",
  /^\/api\/v1\/spaces\/([^/]+)\/invitations\/([^/]+)$/,
  inSpace("admin", async ({ space, match }) => {
    const { inv, error } = actionable(space, match[2]);
    if (error) return error;
    inv.status = "revoked";
    inv.responded_at = Date.now();
    return [204, null];
  }),
);

/** The invitation for a token and the caller, or null. One answer for every failure, so nothing says why. */
function usableInvitation(body, claims) {
  const id = typeof body.token === "string" ? TOKEN_TO_INVITATION.get(body.token) : undefined;
  const inv = id ? invitations.get(id) : undefined;
  if (!inv || inv.status !== "pending" || inv.expires_at <= Date.now()) return null;
  if (String(claims.email).trim().toLowerCase() !== inv.email) return null;
  return inv;
}
const invitee = (handler) =>
  authed(async (ctx) => {
    if (typeof ctx.body.token !== "string" || ctx.body.token === "") return validation(["token", "Field required"]);
    if (ctx.me.fail_invitee === 401) return problem(401, "Not authenticated.");
    if (ctx.me.fail_invitee === 500) return serverError();
    const inv = usableInvitation(ctx.body, ctx.claims);
    if (!inv) return problem(404, "Invitation not found.");
    return handler({ ...ctx, inv, space: spaces.get(inv.space_id) });
  });
addRoute(
  "POST",
  /^\/api\/v1\/invitations\/preview$/,
  invitee(async ({ inv, space }) => {
    const inviter = space.members.find((m) => m.user_id === inv.invited_by);
    return [200, { household_name: space.name, inviter_name: inviter?.display_name ?? null }];
  }),
);
addRoute(
  "POST",
  /^\/api\/v1\/invitations\/accept$/,
  invitee(async ({ inv, space, claims, me }) => {
    if (!space.members.some((m) => m.user_id === claims.sub)) {
      space.members.push({ user_id: claims.sub, email: claims.email, display_name: me.display_name, role: inv.role, joined_at: new Date().toISOString() });
    }
    inv.status = "accepted";
    inv.responded_at = Date.now();
    return [200, { space_id: space.id, household_name: space.name, role: inv.role }];
  }),
);
addRoute(
  "POST",
  /^\/api\/v1\/invitations\/decline$/,
  invitee(async ({ inv }) => {
    inv.status = "declined";
    inv.responded_at = Date.now();
    return [204, null];
  }),
);
// Test helper: create an invitation in a household. Body: {space_id, email, role?, status?, inviter_email?,
// resend_count?, last_sent_seconds_ago?}. Returns {id, token}: the token is what the email link carries.
addRoute("POST", /^\/__test\/invitation$/, async ({ body }) => {
  const space = spaces.get(body.space_id);
  if (!space) return [404, { detail: "no such household" }];
  const inviter = space.members.find((m) => m.email === body.inviter_email) ?? space.members.find((m) => m.role === "owner");
  const inv = makeInvitation(space, {
    email: body.email,
    role: body.role ?? "member",
    status: body.status ?? "pending",
    invited_by: inviter?.user_id,
    responded_at: body.status && !["pending", "expired"].includes(body.status) ? Date.now() - DAY_MS : null,
    resend_count: body.resend_count ?? 0,
    last_sent_at: body.last_sent_seconds_ago !== undefined ? Date.now() - body.last_sent_seconds_ago * 1000 : undefined,
  });
  return [200, { id: inv.id, token: inv.token }];
});
// Test helper: the invitations stored for a household, as the API would list them (no tokens).
addRoute("POST", /^\/__test\/invitations$/, async ({ body }) => [
  200,
  [...invitations.values()].filter((i) => i.space_id === body.space_id).sort((a, b) => b.created_at - a.created_at).map(invitationOut),
]);
// Test helper: requests that carried a token in the URL or a header (see `leaks` above).
addRoute("POST", /^\/__test\/leaks$/, async ({ body }) => [200, leaks.filter((l) => !body.token || l.token === body.token)]);
// Test helper: how the next create/resend behaves for a user: "ok" (default), "not_sent" (saved, email failed) or
// "unconfigured" (503 before saving), and how the invitee calls fail (401 or 500). Body: {email, email_mode?, fail_invitee?, fail_invitations_list?}.
addRoute("POST", /^\/__test\/invitation-mode$/, async ({ body }) => {
  const me = userState({ sub: userIdOf(body.email), email: body.email });
  if (body.email_mode !== undefined) me.email_mode = body.email_mode;
  if (body.fail_invitee !== undefined) me.fail_invitee = body.fail_invitee;
  if (body.fail_invitations_list !== undefined) me.fail_invitations_list = body.fail_invitations_list;
  return [204, null];
});

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

addRoute(
  "GET",
  /^\/api\/v1\/me\/profile$/,
  authed(async ({ me }) => (me.fail_profile ? [500, { type: "about:blank", title: "Internal Server Error", status: 500 }, "application/problem+json"] : [200, profileOut(me)])),
);
addRoute(
  "PATCH",
  /^\/api\/v1\/me\/profile$/,
  authed(async ({ me, body }) => {
    const errors = [];
    const next = {};
    if ("display_name" in body) {
      const name = body.display_name === null ? null : String(body.display_name).trim();
      if (name !== null && (name === "" || [...name].length > 80)) errors.push(["display_name", "String should have at most 80 characters"]);
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
// Test helper: how many times a user called each API path (to check pages do not fetch twice).
const hits = new Map();
addRoute("POST", /^\/__test\/hits$/, async ({ body }) => {
  const sub = uuidFor(`user:${body.email}`);
  const out = {};
  for (const [key, n] of hits) if (key.startsWith(`${sub} `)) out[key.slice(sub.length + 1)] = n;
  return [200, out];
});
// Test helper: seed a user's profile and addresses. Body: {email, display_name?, profile?, addresses?: number | object[]}.
addRoute("POST", /^\/__test\/seed$/, async ({ body }) => {
  const sub = uuidFor(`user:${body.email}`);
  const me = userState({ sub, email: body.email });
  if (body.display_name !== undefined) me.display_name = body.display_name;
  if (body.profile) Object.assign(me.profile, body.profile);
  if (body.fail_profile !== undefined) me.fail_profile = body.fail_profile;
  if (body.addresses !== undefined) {
    const items = typeof body.addresses === "number"
      ? Array.from({ length: body.addresses }, (_, i) => ({ label: `Address ${i + 1}`, line1: `Street ${i + 1}`, city: "Utrecht", country: "NL" }))
      : body.addresses;
    me.addresses = items.map((data, i) => newAddress(me, data, i === 0));
  }
  return [204, null];
});

// Test helper: create households for a user. Body: {email, households: [{name, role, members?: [{email, display_name?, role}], extra_members?: number}]}.
// `role` is the seeded user's own role. Other members get stable ids from their email, so a test can
// sign in as them. Returns the new household ids, in order.
addRoute("POST", /^\/__test\/households$/, async ({ body }) => {
  const sub = userIdOf(body.email);
  const claims = { sub, email: body.email };
  const me = userState(claims);
  ensureSpaces(claims);
  const ids = [];
  let n = 0;
  for (const h of body.households ?? []) {
    n += 1;
    const id = uuidFor(`seeded:${body.email}:${h.name}:${n}`);
    let day = 3;
    const joined = () => new Date(Date.UTC(2026, 10, day++, 10, 0, 0)).toISOString();
    const members = [{ user_id: sub, email: body.email, display_name: me.display_name, role: h.role ?? "owner", joined_at: joined() }];
    for (const m of h.members ?? []) {
      members.push({ user_id: userIdOf(m.email), email: m.email, display_name: m.display_name ?? null, role: m.role ?? "member", joined_at: joined() });
    }
    for (let i = 0; i < (h.extra_members ?? 0); i++) {
      members.push({ user_id: uuidFor(`extra:${id}:${i}`), email: `member${i + 1}@example.test`, display_name: `Member ${i + 1}`, role: "member", joined_at: joined() });
    }
    // Keep the seeded user's household list stable: created_at increases with the order given.
    spaces.set(id, { id, type: "household", name: h.name, created_at: new Date(Date.UTC(2026, 10, 25, 11, n, 0)).toISOString(), members });
    ids.push(id);
  }
  return [200, { ids, personal_id: uuidFor(`personal:${sub}`) }];
});
// Test helper: make a user's list calls fail. Body: {email, spaces?: boolean, members?: boolean}.
addRoute("POST", /^\/__test\/fail$/, async ({ body }) => {
  const me = userState({ sub: userIdOf(body.email), email: body.email });
  if (body.spaces !== undefined) me.fail_spaces = body.spaces;
  if (body.members !== undefined) me.fail_members = body.members;
  // Slow down this user's /api/v1/spaces* calls, to hold the loading and busy states still.
  if (body.delay_ms !== undefined) me.delay_ms = body.delay_ms;
  if (body.me !== undefined) me.fail_me = body.me; // GET /api/v1/me fails: the shell shows "could not load your account"
  return [204, null];
});
// Test helper: remove a user from a household behind the app's back (someone else removed them).
addRoute("POST", /^\/__test\/leave$/, async ({ body }) => {
  const space = spaces.get(body.space_id);
  if (space) space.members = space.members.filter((m) => m.user_id !== userIdOf(body.email));
  return [204, null];
});
// Test helper: read a household as stored (to check what the app really saved).
addRoute("POST", /^\/__test\/space$/, async ({ body }) => {
  const space = spaces.get(body.space_id);
  return space ? [200, space] : [404, { detail: "not found" }];
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
  if (claims) hits.set(`${claims.sub} ${req.method} ${url.pathname}`, (hits.get(`${claims.sub} ${req.method} ${url.pathname}`) ?? 0) + 1);
  const body = req.method === "GET" || req.method === "DELETE" ? {} : await readBody(req);
  const delay = claims ? state.get(claims.sub)?.delay_ms : 0;
  // The page frame's own lookup (GET one space) is never slowed, so a screen's own loading state shows, not the frame's.
  const isFrameLookup = req.method === "GET" && /^\/api\/v1\/spaces\/[^/]+$/.test(url.pathname);
  if (delay && url.pathname.startsWith("/api/v1/spaces") && !isFrameLookup) await new Promise((resolve) => setTimeout(resolve, delay));
  checkLeak(req, url);
  const [status, payload, type, extraHeaders] = await route.handler({
    req,
    url,
    body,
    claims,
    match: route.pattern.exec(url.pathname),
    me: claims ? userState(claims) : null,
    uuidFor,
  });
  res.writeHead(status, { ...cors, "content-type": type ?? "application/json", ...extraHeaders });
  res.end(payload === null ? undefined : JSON.stringify(payload));
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock backend on ${PORT}`));
