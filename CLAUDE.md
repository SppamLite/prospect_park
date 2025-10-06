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

```sh
# Development mode with hot reload
bun --hot index.ts

# Or via npm script
bun run dev

# Custom port (default: 7878)
PORT=5432 bun index.ts
```

### Connecting to the Database

**Connection string format**:

```
postgresql://anyuser:anypass@localhost:7878/bookstore
```

**Example with `psql`**:

```sh
psql postgresql://localhost:7878/bookstore
```

**TypeORM configuration** (NestJS):

```typescript
{
  type: 'postgres',
  host: 'localhost',
  port: 7878,
  username: 'any',      // auth ignored
  password: 'any',      // auth ignored
  database: 'bookstore'
}
```

### Implementation Notes

- Type inference from JSON values (number → int4/float8, string → text, boolean → bool)
- No TLS/SSL support
- No authentication (always accepts)
- In-memory database cache (`DB_CACHE`)
- Limited error handling for demo purposes
- Prepared statements don't support parameters

---

## Bun Conventions

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv

### Bun APIs (Not Used in This Project)

This project uses **raw TCP sockets** via `Bun.listen()`, not the HTTP server APIs below:

- `Bun.serve()` - For HTTP/WebSocket servers (not used here)
- `bun:sqlite` - For SQLite (not applicable)
- `Bun.redis`, `Bun.sql` - For Redis/Postgres clients (not applicable)
- Prefer `Bun.file` over `node:fs` (this project uses `node:fs/promises` for directory scanning)

### Testing

Use `bun test` to run tests.

```ts
import { test, expect } from "bun:test";

test("example", () => {
  expect(1).toBe(1);
});
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**/*.md`.
