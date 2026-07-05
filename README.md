# OpenChat

Mobile-first chat client. Authenticated users paste a provider API key, pick a model, and stream conversations. No external chat platform required: bring your own key, talk to any OpenAI-compatible endpoint.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **TypeScript**, **Tailwind CSS**
- **PostgreSQL** + **Prisma 6**
- **NextAuth 5** (database sessions, Resend magic-link)
- **Vitest** for unit tests

## Quickstart

```bash
# 1. Install
npm install

# 2. Database (PostgreSQL via docker)
docker compose up -d

# 3. Env
cp .env.example .env
# Edit .env: set AUTH_SECRET, AUTH_RESEND_KEY, APP_ENCRYPTION_KEY, PROVIDER_GO_BASE_URL

# 4. Migrate
npm run prisma:migrate

# 5. Dev
npm run dev
# → http://localhost:3000
```

## Environment

| Var | Required | Purpose |
|-----|----------|---------|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `AUTH_URL` | yes | Public app URL (`http://localhost:3002` in dev) |
| `AUTH_SECRET` | yes | NextAuth session encryption |
| `AUTH_RESEND_KEY` | yes | Resend API key for magic-link emails |
| `AUTH_EMAIL_FROM` | yes | Sender address (`"App <addr@resend.dev>"`) |
| `APP_ENCRYPTION_KEY` | yes | 32-byte hex used to encrypt user API keys at rest |
| `PROVIDER_<NAME>_BASE_URL` | yes per provider | e.g. `PROVIDER_GO_BASE_URL="https://opencode.ai/zen/go"` |

Provider base URLs are read by `src/lib/providers.ts` at runtime: `PROVIDER_<UPPERCASE_NAME>_BASE_URL`. The user enters a model id as `<provider>:<modelId>` (e.g. `go:minimax-m3`).

## Scripts

```bash
npm run dev          # dev server (Turbopack)
npm run build        # prisma generate + next build
npm run start        # production
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run prisma:migrate
```

## What's in the box

- Multi-conversation sidebar with **pin** + **rename** (double-click to edit)
- **Cmd+K** model picker (keyboard navigation: ↑/↓/Enter/Escape)
- **Cmd+N** new conversation
- **Enter** to send, **Shift+Enter** for newline
- Streaming responses with **thinking** block (collapsible) for models that expose `reasoning_content`
- Copy-to-clipboard on code blocks (no more `[object Object]`)
- Auto-scroll that **stops** when the user scrolls up
- Per-user encrypted API key, never sent to the client
- Server-side conversation summary (refreshed every 8 assistant messages)

## What's not in the box

- File/image uploads
- Multi-user collaboration
- Mobile native apps (PWA only via `public/manifest.json` + `public/sw.js`)
- Real OAuth providers (Resend magic-link only)
- Thinking tokens persisted in DB (session only)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design.
