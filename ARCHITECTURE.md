# Architecture

## Overview

OpenChat is a thin Next.js server that brokers chat requests between a logged-in user and an OpenAI-compatible provider. The user's API key never leaves the server. The DB stores conversations, messages, and a per-user cache of provider models.

```
┌────────────────┐   HTTPS   ┌──────────────────┐
│  Browser (PWA) │ ────────▶ │  Next.js (App    │
│  React 19      │ ◀──────── │   Router)        │
│  Tailwind      │   SSE     │  Server Actions  │
└────────────────┘           │  Route Handlers  │
                             │                  │
                             │  Middleware:     │
                             │   auth + rate    │
                             └────────┬─────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                ▼                     ▼                     ▼
        ┌──────────────┐      ┌──────────────┐      ┌──────────────────┐
        │  PostgreSQL  │      │ Upstash Redis│      │  Provider (Go)   │
        │  Prisma 6    │      │  (optional)  │      │  /v1/models      │
        │  + NextAuth  │      │  rate-limit  │      │  /v1/chat/...    │
        └──────────────┘      └──────────────┘      └──────────────────┘
```

## Layered design

```
src/
  app/                Next.js App Router (UI + route handlers)
    api/              Route Handlers = thin controllers, all delegate to lib
    login/, page.tsx  RSC + client islands
  components/         React 19 client components (chat-shell, markdown-message)
  lib/                Pure TS, no React
    prisma.ts         Singleton client
    session.ts        requireUserId() → throws 401 if unauthenticated
    http.ts           json() + errorResponse() (ZodError → 400, mapped Errors → 401/429/404)
    rate-limit.ts     Upstash sliding-window per user; no-op if env missing
    crypto.ts         AES-256-GCM encrypt/decrypt for the user API key
    validation.ts     Zod schemas for every API input
    providers.ts      Provider-agnostic streaming + model listing
    memory.ts         System prompt + sliding window + summary compaction
  auth.ts             NextAuth 5 with PrismaAdapter, Resend magic-link
prisma/schema.prisma  Models: User, Account, Session, UserSettings, Conversation, Message, ModelCache
```

**Key invariant:** `lib/*` has zero React and zero `next/*` imports except `auth.ts` (which is the NextAuth handler). Everything testable lives in `lib/`.

## Data model

```
User ──┬─ Account (NextAuth)
       ├─ Session (NextAuth, database strategy)
       ├─ UserSettings (apiKeyEncrypted, defaultModel, theme)
       └─ Conversation ──── Message
            ▲                   ▲
            │                   │
            └─ ModelCache ◀─────┘ (per-user, per-provider, per-modelId)
```

- `Message.model` stores the `provider:modelId` used (cheap, denormalized)
- `ModelCache` is populated on demand by `/api/models/sync`; the picker only shows what the user has already discovered
- `apiKeyEncrypted` is AES-256-GCM, IV + tag + ciphertext concatenated as JSON. The key is `APP_ENCRYPTION_KEY` (32 bytes hex)

## Request flow: send a prompt

1. **Client** (`chat-shell.tsx → sendMessage`):
   - Optional auto-create of `Conversation` via `POST /api/conversations`
   - Optimistic add: empty user message + `streaming` placeholder assistant
2. **Server** (`api/chat/route.ts POST`):
   - `requireUserId()` → 401 if not authed
   - `rateLimit("chat", userId)` → 429 if exceeded
   - `zod.parse(chatSchema)` → 400 on shape error
   - Load `Conversation` + last 40 `Message`s
   - Persist the user `Message` immediately
   - `buildConversationContext()` = `[SYSTEM_PROMPT, …summary…, last-30-messages]`
   - `streamChat({ apiKey, model, messages })` → SSE stream
3. **Provider** (`lib/providers.ts`):
   - `provider:modelId` split → resolve `PROVIDER_<NAME>_BASE_URL`
   - `POST <base>/v1/chat/completions` with `stream: true`
   - Parse SSE chunks, yield `{ thinking } | { token }`
4. **Server** streams back to client as `data: { thinking | token | done | error }` SSE
5. **Client** accumulates both into the `streaming` message, extracting `<think>…</think>` inline tags into a separate `thinking` field shown in a collapsible block
6. **Server** persists the final assistant `Message` and bumps the `Conversation.summary` every 8 turns

## Streaming protocol

Server → client SSE events:

```
data: {"thinking":"..."}\n\n     # model reasoning_content, optional
data: {"token":"..."}\n\n        # model content
data: {"done":true}\n\n
data: {"error":"invalid_key"}\n\n
```

`text/event-stream`, `no-cache`, `keep-alive`. AbortController on the client kills the upstream fetch (cascades to the provider via `signal`).

## Security

- API key encrypted at rest (`aes-256-gcm`), never returned to the client
- All `/api/*` routes go through `requireUserId()` (DB session, not JWT)
- Per-user rate limit on `chat` (30/min) and `settings` (10/min); degrades open if Upstash env is missing
- `assertOwner()` on every `Conversation` mutation
- `chatSchema.message` capped at 20k chars
- NextAuth `signIn` redirects unauthed users to `/login` via `pages.signIn`
- `.env*` excluded from agent reads (read permissions deny pattern)

## Memory strategy

`buildConversationContext` (lib/memory.ts):

- **System prompt** (always first): "chat GPT-like, no app building, reply in user language, no boilerplate"
- **Summary** (if exists): compressed prior context, refreshed every 8 assistant messages via `compactSummary()`
- **Recent messages**: last 30, mapped to OpenAI roles

The model itself is responsible for all intelligence — the summary is just a continuity hint, not a knowledge base.

## Provider abstraction

`providers.ts` is the only file that knows about external APIs. Two functions:

```ts
listProviderModels(provider: string, apiKey: string)
  → calls GET <base>/v1/models, normalizes to {provider, modelId, displayName, free, available}

streamChat({apiKey, model, messages, signal})
  → yields {thinking} | {token}, handles 401/403/429/network
```

`baseUrl()` reads `PROVIDER_<UPPERCASE_PROVIDER>_BASE_URL` from env. Model ids are stored as `provider:modelId` everywhere in the DB and the UI; the split happens once at the API boundary.

Current setup: `PROVIDER_GO_BASE_URL=https://opencode.ai/zen/go` (OpenCode Go gateway, OpenAI-compatible).

## Auth

NextAuth 5 with `PrismaAdapter` and `database` session strategy. One provider: **Resend magic-link** (no passwords). Pages: `/login` is the only unauthed page; `app/page.tsx` renders the chat for authed users.

## UI shell

`chat-shell.tsx` is a single client component (~700 lines) containing:

- Sidebar (conversations list, search, pin/rename/delete)
- Messages area (auto-scroll, streaming, thinking blocks, copy buttons)
- Input (textarea + Cmd+K model picker, Cmd+N new chat, Enter/Shift+Enter)

Server-rendered shell would be a larger refactor; the cost is acceptable for a single-user-at-a-time chat tool.

## Known limits

- **Thinking not persisted**: streams are saved as `Message.content` only; the thinking block vanishes on refresh
- **One user per DB row**: no org/team concept
- **No streaming resume**: refresh = lose the in-flight response
- **Search is client-side substring** on the visible 25 conversations
- **Summary is lossy**: `compactSummary` keeps only the last 500/800 chars of each side

## Testing

`lib/crypto.test.ts` and `lib/memory.test.ts` cover the deterministic pure functions. Route handlers are exercised manually in dev. UI has no tests yet (the streaming behavior is the most valuable thing to cover).
