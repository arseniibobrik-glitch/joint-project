# Notion Base

Data layer for a Notion-like application: blocks, pages, databases, realtime collaboration.

## Architecture

```
packages/
├── shared/     # Zod schemas & TypeScript types (single source of truth)
├── db/         # Drizzle ORM schemas, migrations, PostgreSQL client
├── auth/       # BetterAuth configuration (email/password, OAuth, workspaces)
├── api/        # Fastify + tRPC REST API (blocks, pages, databases, workspaces, files)
└── realtime/   # Yjs WebSocket server for realtime collaboration
```

## Quick Start

```bash
# 1. Start PostgreSQL + Redis
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Generate & run migrations
pnpm db:generate
pnpm db:push

# 4. Start dev servers
pnpm dev          # API on :3000
pnpm dev:realtime # WebSocket on :3001
```

## Environment Variables

Create `.env` in root:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=notion
DB_PASSWORD=notion
DB_NAME=notion_base

# Auth
BETTER_AUTH_SECRET=your-secret-key
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# API
PORT=3000
HOST=0.0.0.0

# Realtime
REALTIME_PORT=3001
```

## API (tRPC)

All endpoints under `/trpc`:

| Router | Procedures |
|--------|------------|
| `blocks` | `list`, `get`, `create`, `update`, `delete`, `move`, `duplicate` |
| `pages` | `tree`, `get`, `create`, `update`, `delete`, `move`, `duplicate` |
| `databases` | `get`, `getWithRows`, `create`, `update`, `delete`, `query`, `createRow`, `updateRow`, `deleteRow`, `batchCreateRows` |
| `workspaces` | `list`, `get`, `create`, `update`, `inviteMember`, `listMembers`, `updateMemberRole`, `removeMember` |
| `files` | `getUploadUrl`, `confirmUpload`, `list`, `delete` |

Auth via BetterAuth at `/api/auth/*`.

## Realtime

WebSocket: `ws://localhost:3001/ws?token=<session>&doc=page:<pageId>`

- Uses Yjs CRDT for conflict-free collaboration
- Presence, cursors, selections via awareness protocol
- One Y.Doc per page/database

## Database Schema

Key tables: `users`, `workspaces`, `workspace_members`, `pages`, `blocks`, `databases`, `database_rows`, `files`, `comments`.

Blocks stored as JSONB with discriminated union by `type` — matches Notion block types exactly.

## Shared Types

Import from `@notion-base/shared`:

```ts
import { Block, Page, Database, CreateBlockInput, schemas } from '@notion-base/shared'
// Zod schemas: schemas.Block, schemas.Page, etc.
// TypeScript types: Block, Page, Database, etc.
```

## For Frontend (Friend's Part)

```bash
# In their repo:
pnpm add @notion-base/shared @trpc/client @tanstack/react-query
```

```ts
// tRPC client setup
import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '@notion-base/api'

export const trpc = createTRPCReact<AppRouter>()
```

## Commands

```bash
pnpm dev              # API dev server
pnpm dev:realtime     # Realtime dev server
pnpm db:generate      # Generate migrations
pnpm db:push          # Push schema to DB
pnpm db:studio        # Drizzle Studio UI
pnpm build            # Typecheck all packages
pnpm lint             # Lint all packages
```

## License

MIT