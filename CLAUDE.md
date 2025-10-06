# Prospect Park - PostgreSQL-compatible JSON Database

A PostgreSQL wire-protocol compatible database server that reads JSON files as database tables. Designed for demo purposes to allow backend frameworks (NestJS with TypeORM) and database tools (TablePlus, pgAdmin, etc.) to connect via standard PostgreSQL configuration.

## Project Overview

**Core Technology**: Bun + TypeScript
**Protocol**: PostgreSQL v3 wire protocol
**Storage**: JSON files in `./data/<database>/` directories

### Architecture

- **TCP Server**: Built with `Bun.listen()` (not `Bun.serve()`)
- **Protocol Support**:
  - Simple Query Protocol (`Q` message)
  - Extended Query Protocol: Parse, Bind, Describe, Execute, Sync, Flush, Close
  - SSL Request (responds with `N` - not supported)
  - No authentication (responds with `AuthenticationOk`)
- **SQL Support**: Very limited subset
  - `SELECT * FROM table [WHERE col = literal] [LIMIT n]`
  - `SELECT col1, col2 FROM table [WHERE col = literal] [LIMIT n]`
  - `SELECT count(*) FROM table [WHERE col = literal] [LIMIT n]`
  - `SELECT 1` (built-in for connection testing)
  - No parameters in prepared statements

### Data Storage Format

```
data/
├── bookstore/          # Database name
│   ├── books.json     # Table: books
│   └── authors.json   # Table: authors
└── myapp/             # Another database
    └── users.json     # Table: users
```

Each JSON file must contain an **array of objects**:

```json
[
  { "id": 1, "title": "Example", "price": 12.5 },
  { "id": 2, "title": "Another", "price": 15.0 }
]
```

### Running the Server

#### Local Development

```sh
# Development mode with hot reload
bun --hot index.ts

# Or via npm script
bun run dev

# Custom port and database
PORT=5432 POSTGRES_DB=bookstore bun index.ts
```

#### Docker

```sh
# Build and run with docker-compose
docker-compose up

# Run in background
docker-compose up -d

# Stop
docker-compose down
```

#### Environment Variables

- `PORT` - Server port (default: 5432)
- `POSTGRES_PORT` - Alternative port variable (Docker compatibility)
- `POSTGRES_DB` - Default database name (default: postgres)
- `HOST` - Bind address (default: 0.0.0.0)
- `POSTGRES_USER` - Username (default: postgres)
- `POSTGRES_PASSWORD` - Password (default: postgres)
- `LOG_LEVEL` - Log level: debug, info, warn, error (default: info)

**Authentication:**

- Defaults to `postgres`/`postgres` (same as PostgreSQL)
- Override via environment variables or `.env` file

### Connecting to the Database

**Connection string format**:

```
postgresql://anyuser:anypass@localhost:5432/bookstore
```

**Example with `psql`**:

```sh
psql postgresql://localhost:5432/bookstore
```

**Docker example**:

```sh
# Connect to the running container
docker-compose exec db psql postgresql://localhost:5432/bookstore
```

**TypeORM configuration** (NestJS):

```typescript
{
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'any',      // auth ignored
  password: 'any',      // auth ignored
  database: 'bookstore'
}
```

**Docker Compose example** (matching PostgreSQL syntax):

```yaml
services:
  db:
    image: your-dockerhub-username/prospect-park
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: north_forest
      POSTGRES_USER: postgres # Optional: enables auth if both user & password set
      POSTGRES_PASSWORD: pass1234 # Optional: enables auth if both user & password set
    volumes:
      - ./data:/app/data
```

### Implementation Notes

- **Type Safety**: Fully type-safe TypeScript with strict mode, no `any` types
- **Runtime Validation**: JSON data validated with Zod schemas
- **Type Inference**: Infers PostgreSQL types from JSON values (number → int4/float8, string → text, boolean → bool)
- **No Caching**: JSON files read fresh on every query (files are single source of truth)
- **Bun-Native**: Uses `Bun.file()` and `Glob` APIs (no Node.js fs dependencies)
- **Read-Only**: Explicitly rejects INSERT/UPDATE/DELETE/DROP/CREATE operations
- **No TLS/SSL**: Server responds with `N` to SSL requests
- **Required Authentication**: Simple user/password auth via environment variables (required)
- **Structured Logging**: Pino logger with pretty-print in development
- **Limited SQL**: Prepared statements don't support parameters

---

## Bun Conventions

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv

### Bun APIs Used in This Project

- **`Bun.listen()`** - Raw TCP sockets for PostgreSQL wire protocol
- **`Bun.file()`** - Reading JSON table files
- **`Glob`** - Finding JSON files in database directories (from `bun` package)

### Bun APIs Not Used

- `Bun.serve()` - For HTTP/WebSocket servers (this is a TCP server)
- `bun:sqlite` - For SQLite (not applicable)
- `Bun.redis`, `Bun.sql` - For Redis/Postgres clients (not applicable)
- `node:fs` - Not used; replaced with Bun's native file APIs

### Testing

Use `bun test` to run tests.

```ts
import { test, expect } from "bun:test";

test("example", () => {
  expect(1).toBe(1);
});
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**/*.md`.
