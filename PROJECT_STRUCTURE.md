# Project Structure

This document describes the modular architecture of Prospect Park after refactoring.

## Directory Layout

```
prospect_park/
├── index.ts                    # Main entry point (3 lines)
├── src/
│   ├── server.ts              # TCP server setup and message routing
│   ├── types/
│   │   └── index.ts           # Shared type definitions
│   ├── protocol/
│   │   ├── messages.ts        # PostgreSQL wire protocol message builders
│   │   └── framing.ts         # Message framing and buffering
│   ├── handlers/
│   │   ├── connection.ts      # Startup and connection management
│   │   └── messages.ts        # Frontend message handlers (Q, P, B, D, E, etc.)
│   ├── sql/
│   │   ├── parser.ts          # SQL query parser
│   │   └── executor.ts        # Query execution engine
│   ├── storage/
│   │   └── json-store.ts      # JSON file storage layer
│   └── utils/
│       └── bytes.ts           # Byte manipulation utilities
├── data/
│   └── <database>/
│       └── *.json             # Table files
└── package.json
```

## Module Responsibilities

### `index.ts`

- Entry point that imports and starts the server
- Minimal bootstrapping code

### `src/server.ts`

- Sets up the Bun TCP server with `Bun.listen()`
- Routes incoming messages to appropriate handlers
- Main message dispatch switch statement

### `src/types/index.ts`

- All TypeScript type definitions
- Shared types: `Bytes`, `PgSocket`, `ColumnSpec`, `DB`, `Table`, `SelectQuery`, `ConnState`, etc.
- PostgreSQL OID constants
- **Type-safe**: No `any` types used anywhere in the codebase

### `src/protocol/messages.ts`

- PostgreSQL wire protocol message builders
- Functions: `AuthenticationOk()`, `ReadyForQuery()`, `ErrorResponse()`, `RowDescription()`, `DataRow()`, etc.
- Pure functions that return byte arrays

### `src/protocol/framing.ts`

- Message framing logic
- Buffering and parsing of frontend messages
- Extracts complete messages from TCP stream

### `src/handlers/connection.ts`

- Handles startup sequence (StartupMessage, SSLRequest, CancelRequest)
- Connection state initialization
- Sends authentication and parameter status messages

### `src/handlers/messages.ts`

- Implements handlers for each frontend message type:
  - `handleSimpleQuery()` - 'Q' message
  - `handleParse()` - 'P' message
  - `handleBind()` - 'B' message
  - `handleDescribe()` - 'D' message
  - `handleExecute()` - 'E' message
  - `handleClose()` - 'C' message
  - `handleTerminate()` - 'X' message

### `src/sql/parser.ts`

- Parses SQL SELECT statements
- Extracts columns, table, WHERE clause, LIMIT
- Handles COUNT(\*) queries
- Returns `SelectQuery` object or `null`

### `src/sql/executor.ts`

- Executes parsed SELECT queries against JSON data
- Type inference from JSON values (string → text, number → int4/float8, etc.)
- Filters rows based on WHERE clause
- Applies LIMIT
- Returns column specs and data rows

### `src/storage/json-store.ts`

- Loads JSON files from `./data/<database>/` directory using Bun's native APIs
- **No caching**: Reads files fresh on every query (JSON files are single source of truth)
- Uses `Bun.file()` for reading and `Glob` for file discovery
- Validates JSON data with Zod schemas at runtime
- Each `.json` file = one table
- Tables must be arrays of objects

### `src/utils/bytes.ts`

- Low-level byte manipulation utilities
- Big-endian integer encoding (`be16`, `be32`)
- Buffer concatenation
- Null-terminated string encoding/decoding
- Text encoder/decoder instances

## Design Principles

1. **Single Responsibility**: Each module has one clear purpose
2. **Pure Functions**: Most functions are stateless transformations
3. **Type Safety**: Strict TypeScript with no `any` types, runtime validation with Zod
4. **Bun-Native**: Uses Bun's native APIs (`Bun.file()`, `Glob`) instead of Node.js dependencies
5. **No Caching**: JSON files are always read fresh as single source of truth
6. **Separation of Concerns**: Protocol, SQL, storage, and handlers are independent
7. **Testability**: Small, focused modules are easy to unit test
8. **Readability**: Clear naming and organization

## Key Improvements from Original

- **Reduced file size**: Main index.ts went from 658 lines to 3 lines
- **Modular**: Easy to find and modify specific functionality
- **Maintainable**: Clear boundaries between layers
- **Extensible**: Easy to add new SQL features, message types, or storage backends
- **Better organization**: Related code grouped together
- **Type-safe**: Fully type-safe with strict TypeScript, no `any` types
- **Runtime validation**: JSON data validated with Zod schemas
- **Bun-optimized**: Uses Bun's native file APIs instead of Node.js fs
- **No caching**: Always reads fresh data from JSON files

## Adding New Features

### To add a new SQL feature:

1. Update the regex in `src/sql/parser.ts`
2. Update `SelectQuery` type in `src/types/index.ts`
3. Update `execSelect()` in `src/sql/executor.ts`

### To add a new message type:

1. Add handler function in `src/handlers/messages.ts`
2. Add case in switch statement in `src/server.ts`

### To add a new storage backend:

1. Implement the same interface as `src/storage/json-store.ts`
2. Update imports in `src/handlers/` files

## Running the Server

```sh
# Development with hot reload
bun --hot index.ts

# Or via npm script
bun run dev

# Custom port
PORT=5432 bun index.ts
```
