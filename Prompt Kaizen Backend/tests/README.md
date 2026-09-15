# Phase 1 verification suites

Black-box tests that exercise the running API over HTTP and assert against
MongoDB directly. They cover the security and integrity fixes made in Phase 1:

| File | Covers |
|---|---|
| `security.test.js` | NoSQL injection, mass assignment, password policy, account enumeration, invalid-ObjectId handling, lockout, token revocation, CORS, secret serialization |
| `contest.test.js` | Scenario gating before a contest opens, server-side duration enforcement, scenario freeze after first attempt, allow-list, leaderboard PII masking |
| `password-reset.test.js` | Token hashing at rest, single use, replay, expiry, session revocation on reset |
| `mail-resilience.test.js` | SMTP never blocks the request path, outage is observable, OTPs never logged in production, stranded users recoverable by an admin |
| `scoring-integrity.test.js` | Rubric totals 100, gaming resistance (paste/echo detection), context and relevance are independent, scenarios cannot be forged, model output clamped, rule-based fallback contract |
| `pagination.test.js` | Page correctness, limits clamped, search reaches past the old 1000-record cap, search input cannot inject a regex or cause ReDoS |

## Running

They need a MongoDB instance and a server booted against it:

```bash
# 1. a throwaway mongod
mongod --dbpath /tmp/pk-test --port 27055 --bind_ip 127.0.0.1 &

# 2. the API pointed at it
PORT=5099 \
MONGO_URI=mongodb://127.0.0.1:27055/pk_phase1_test \
JWT_SECRET="$(openssl rand -base64 48)" \
MAX_FAILED_LOGINS=3 \
node server.js &

# 3. the suites
npm test
```

These are deliberately dependency-free (plain Node, `fetch`, the mongoose
driver) so they run without adding a test framework. Phase 2 replaces the
harness with a proper runner plus fixtures and CI, and keeps these assertions.

`MAX_FAILED_LOGINS=3` is required — the lockout test assumes that threshold.
`mail-resilience.test.js` additionally expects the server booted WITHOUT
`EMAIL_USER`/`EMAIL_PASSWORD` and with `NODE_ENV=development`, which is the
normal local-dev configuration.
Each suite truncates the collections it uses, so point it at a scratch
database, never a real one.
