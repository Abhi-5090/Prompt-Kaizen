# Prompt Kaizen — Prompt Engineering Compatibility Analyzer

A MERN application that scores user-written prompts against real-world scenarios across 10 parameters (out of 100), rewrites them, and wraps the loop in streaks, daily challenges, badges and scheduled contests.

Three independent apps share one MongoDB:

```
Prompt Kaizen/
├── Prompt Kaizen Backend/    # Node + Express + Mongoose + JWT   → Render   (:5000)
├── Prompt Kaizen Frontend/   # Vite + React + Tailwind (users)   → Vercel   (:5173)
└── Prompt Kaizen Admin/      # Vite + React + Tailwind (operators) → Vercel (:5174)
```

Admin functionality lives entirely in the Admin app; the user app has no admin pages.

---

## 1. Quick start

**Prerequisites:** Node 18+, MongoDB (local or Atlas).

```bash
# Backend
cd "Prompt Kaizen Backend"
npm install
cp .env.example .env          # then edit — see §2
npm run seed:admin            # creates the first admin from ADMIN_* vars
npm run dev                   # http://localhost:5000

# User frontend
cd "../Prompt Kaizen Frontend" && npm install && npm run dev   # :5173

# Admin frontend
cd "../Prompt Kaizen Admin" && npm install && npm run dev      # :5174
```

> **Email is not required to develop locally.** With `EMAIL_USER`/`EMAIL_PASSWORD` unset and `NODE_ENV` not `production`, verification codes and reset links are printed to the server console instead of being emailed, so the whole signup flow is testable. This fallback is gated on `NODE_ENV` and cannot be enabled in production.

> On macOS, port 5000 is used by AirPlay Receiver. Either turn it off (System Settings → General → AirDrop & Handoff) or set `PORT=5001`.

---

## 2. Configuration

Every variable is documented in [`Prompt Kaizen Backend/.env.example`](Prompt%20Kaizen%20Backend/.env.example). The ones that matter most:

| Variable | Notes |
|---|---|
| `MONGO_URI` | Required. Boot fails without it. |
| `JWT_SECRET` | Required, ≥32 chars. **The server refuses to start** on a missing, placeholder, or (in production) short secret. Generate with `openssl rand -base64 48`. |
| `CLIENT_URL` | Comma-separated CORS allow-list. Must exactly match the deployed frontend origins. |
| `EMAIL_USER` / `EMAIL_PASSWORD` | Gmail address + [app password](https://myaccount.google.com/apppasswords). Without these, nobody can complete signup in production. |
| `OPENAI_API_KEY` + `LLM_ANALYSIS_ENABLED=true` | Turns on LLM scoring. Off by default; the rule-based analyzer runs either way. |

Config is validated at boot. Invalid values stop the process with a readable list of problems rather than failing later per-request.

---

## 3. How scoring works

Two layers. **The rule-based analyzer always runs** — it is instant, free, and is the fallback. When `LLM_ANALYSIS_ENABLED=true` and a key is present, an LLM additionally scores the same rubric and rewrites the learner's own prompt.

Every LLM failure mode — missing key, timeout, rate limit, refusal, malformed output — degrades to the rule-based result. A vendor outage makes scores less insightful, never failing.

| Parameter | Max | Parameter | Max |
|---|---|---|---|
| Clarity | 10 | Output Format | 10 |
| Context | 15 | Constraints | 10 |
| Role Assignment | 10 | Tone | 5 |
| Task Definition | 15 | Relevance | 5 |
| Input Parameters | 15 | Grammar & Structure | 5 |

Ratings: `90+ Excellent`, `75–89 Good`, `60–74 Average`, `40–59 Needs Improvement`, `<40 Poor`.

**Anti-gaming.** Scenarios are content-addressed and resolved server-side, so a client cannot invent one (the raw text is verified against the bank either way). Context and Relevance are computed from independent signals rather than the same keyword-overlap ratio. Verbatim reproduction of the brief is detected and penalised. Which engine produced a score is stored on each evaluation as `scoredBy`.

Model defaults to `gpt-4o-mini` (~$0.001 per analysis). `OPENAI_MODEL=gpt-4o` is roughly 20× the cost — worth it only if real submissions show mini grading poorly.

---

## 4. API

All JSON. Protected routes need `Authorization: Bearer <token>`. Errors carry a `requestId` that matches the server's access log.

### Auth — `/api/auth`
| Method | Path | Notes |
|---|---|---|
| POST | `/register` | Returns 201 whether or not the address is taken (no account enumeration). |
| POST | `/verify-otp` | 6-digit code, 5 attempts per code. |
| POST | `/resend-otp` | Rate-limited to 5 per 15 min per IP. |
| POST | `/login` | Locks the account for `LOCK_MINUTES` after `MAX_FAILED_LOGINS` failures. |
| POST | `/forgot-password` | Always returns the same response. |
| POST | `/reset-password` | Single-use token; signs out all other sessions. |
| GET | `/me` | Current user. |

### Prompts — `/api/prompts` *(protected)*
`GET /scenario?category=` · `POST /analyze` · `GET /history` (paginated: `page`, `limit`, `search`, `category`) · `GET /:id` · `DELETE /:id` · `GET /daily-challenge` · `GET /daily-challenge/history`

### Dashboard — `/api/dashboard` *(protected)*
`GET /stats` · `GET /badges` · `GET /weekly-recap`

### Contests — `/api/contests` *(protected)*
`GET /` · `GET /:id` · `POST /:id/start` · `POST /:id/submit` · `GET /:id/result` · `GET /:id/leaderboard` · `GET /leaderboard`

Scenarios are withheld until the contest window opens. The per-user time limit is enforced server-side.

### Admin — `/api/admin` *(protected + admin)*
`GET /stats` · `GET /users` · `GET /prompts` (both paginated + searchable) · `GET /users/export` · `POST /users/bulk-upload` · `POST /users/:id/reset-password` · `POST /users/:id/verify-email` · `DELETE /users/:id` · `GET /mail-status`

Admin contests live under `/api/admin/contests`.

Privileged actions are recorded in an `AuditLog` collection.

---

## 5. Testing

```bash
cd "Prompt Kaizen Backend"
# needs a MongoDB and a running API — see tests/README.md
npm test
```

112 assertions across six suites covering auth security, contest integrity, password reset, mail resilience, scoring integrity and pagination. They run in CI on every push (`.github/workflows/ci.yml`), against a real MongoDB service container.

---

## 6. Deployment

**API → Render.** [`render.yaml`](render.yaml) is a blueprint: point Render at this repo and set the eight secrets marked `sync: false`. Health check is `/api/health`; `/api/ready` additionally reports database and mail status.

**Frontends → Vercel.** Each app has a `vercel.json` with SPA rewrites (without them, deep links 404 on refresh). Set `VITE_API_BASE_URL` to the Render URL plus `/api`.

After deploying, add both Vercel origins to `CLIENT_URL` on the API or CORS will block them.

---

## 7. Theming

Both apps support **light, dark and system** themes, toggled from the navbar.
System is the default and follows the OS live.

Colour is defined once in `.design/tokens.css` as semantic roles (`--ink`,
`--surface`, `--brand`, …) and synced into each app's `src/styles/tokens.css`.
To change the palette, edit `.design/tokens.css` and re-copy it into both apps.

The theme is applied by an inline script in `index.html` before first paint, so
dark-mode users never see a white flash. `node scripts/verify-theme.cjs` (after
building both apps) checks every themed class still responds to the theme, and
runs in CI.

All text colours meet WCAG AA in both themes. Note that the original brand
orange `#F15D23` scores only 3.32:1 on white, so brand-coloured *text* uses a
deepened `#C2470F`; brand *fills* keep the exact brand colour.

---

## 8. Conventions

- User app stores `pk_token`/`pk_user`; admin app uses `pk_admin_token`/`pk_admin_user`, so both can be open at once.
- Passwords are bcrypt (10 rounds); `password`, `otpHash` and `passwordResetTokenHash` are `select: false` and stripped from JSON.
- Changing a password increments `tokenVersion`, immediately invalidating every existing JWT for that user.
- Validation runs in middleware before controllers. Unlisted fields are dropped, which is what stops both NoSQL-operator injection and mass assignment.

---

## 9. Troubleshooting

| Symptom | Cause |
|---|---|
| Server exits at boot with `✗` lines | Config invalid — the output names each problem. |
| `MongoDB connection error` | `mongod` not running, or `MONGO_URI` wrong. |
| CORS blocked | The browser's origin is not in `CLIENT_URL`. Restart after changing it. |
| Signup works but no email arrives | Check `GET /api/ready` — `status: degraded` means the mail transport is down. Locally, the code is in the server console. |
| A user is stuck unverified | Admin → Users → verify, or `POST /api/admin/users/:id/verify-email`. |
| 401 loops | Clear `pk_*` keys from localStorage. A password change signs out old sessions by design. |

For architecture, data model and feature detail, see [DOCUMENTATION.md](DOCUMENTATION.md).
