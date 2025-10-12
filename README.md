# Prospect Park - PostgreSQL-compatible JSON Database

A lightweight PostgreSQL wire-protocol compatible database server that reads JSON files as database tables. Perfect for demos, prototyping, and development environments.

## Features

- **PostgreSQL Compatible**: Works with any PostgreSQL client (psql, TablePlus, pgAdmin, TypeORM, etc.)
- **Multi-Schema Support**: Organize tables into schemas (public, sales, inventory, etc.)
- **Multi-Database Support**: Switch between databases seamlessly from your client
- **Read-Only**: Perfect for demo/testing - rejects all write operations (INSERT/UPDATE/DELETE)
- **JSON-based Storage**: Each `.json` file = one table (simple and portable)
- **Type-Safe**: Built with TypeScript and runtime validation via Zod
- **Bun-Powered**: Fast startup and execution using Bun runtime
- **Docker Ready**: Drop-in replacement for PostgreSQL in docker-compose
- **Required Authentication**: Simple user/password auth via environment variables
- **Structured Logging**: Pino logger with pretty output in development
- **GUI Client Ready**: Full support for TablePlus, pgAdmin, DBeaver with schema/table discovery

## Quick Start with Docker

**Simple setup with defaults** (user: `postgres`, password: `postgres`):

```bash
docker run -p 5432:5432 \
  -e POSTGRES_DB=bookstore \
  -v $(pwd)/data:/app/data \
  your-dockerhub-username/prospect-park
```

**Custom credentials:**

```bash
docker run -p 5432:5432 \
  -e POSTGRES_DB=bookstore \
  -e POSTGRES_USER=myuser \
  -e POSTGRES_PASSWORD=mypassword \
  -v $(pwd)/data:/app/data \
  your-dockerhub-username/prospect-park
```

## Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  db:
    image: your-dockerhub-username/prospect-park
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: bookstore
      POSTGRES_USER: postgres # Required
      POSTGRES_PASSWORD: pass1234 # Required
    volumes:
      - ./data:/app/data
```

Then run:

```bash
docker-compose up
```

## Data Format

Create JSON files organized by database and schema:

```
data/
├── bookstore/              # Database name
│   ├── public/            # Schema: public (default)
│   │   ├── books.json
│   │   └── authors.json
│   └── sales/             # Schema: sales
│       └── records.json
└── ecommerce/             # Another database
    ├── public/
    │   └── customers.json
    ├── inventory/
    │   ├── products.json
    │   └── suppliers.json
    └── orders/
        └── order_items.json
```

Each JSON file must contain an **array of objects**:

```json
[
  { "id": 1, "title": "The Great Gatsby", "price": 12.99 },
  { "id": 2, "title": "1984", "price": 14.99 }
]
```

**Schema Support:**
- Each subdirectory under `data/<database>/` is a schema
- Use `public` schema for default tables
- Query with schema: `SELECT * FROM sales.records`
- Query without schema: `SELECT * FROM books` (defaults to `public`)

## Connecting

Use any PostgreSQL client:

```bash
# psql
psql postgresql://localhost:5432/bookstore

# Connection string for apps
postgresql://anyuser:anypass@localhost:5432/bookstore
```

## Environment Variables

| Variable            | Description                          | Default  |
| ------------------- | ------------------------------------ | -------- |
| `PORT`              | Server port                          | 5432     |
| `POSTGRES_DB`       | Default database name                | postgres |
| `POSTGRES_USER`     | Username                             | postgres |
| `POSTGRES_PASSWORD` | Password                             | postgres |
| `HOST`              | Bind address                         | 0.0.0.0  |
| `LOG_LEVEL`         | Log level (debug, info, warn, error) | info     |

**Authentication:**

- Defaults to `postgres`/`postgres` (same as PostgreSQL)
- Override with environment variables for custom credentials

## Supported SQL

**Read-only operations:**

- `SELECT * FROM [schema.]table [WHERE col = literal] [LIMIT n] [OFFSET n]`
- `SELECT col1, col2 FROM [schema.]table [WHERE col = literal] [LIMIT n]`
- `SELECT count(*) FROM [schema.]table [WHERE col = literal]`
- `SELECT 1` (connection testing)
- `SELECT version()` (server version)
- `SHOW TABLES` (list all tables)
- Schema-qualified queries: `SELECT * FROM sales.records`
- Metadata queries: `information_schema.tables`, `pg_catalog.pg_namespace`, `pg_catalog.pg_database`

**❌ Write operations are rejected:**

- INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, etc.
- Server returns error: "Write operations not supported - this is a read-only database"

**❌ Not supported:**

- JOINs, subqueries, GROUP BY, ORDER BY (except in metadata queries)
- Prepared statement parameters
- Transactions, locks, triggers, functions

## Use Cases

- **Demo applications**: Quick PostgreSQL-compatible database for demos
- **Prototyping**: Test backend frameworks without setting up PostgreSQL
- **Development**: Local development with JSON files as version-controlled data
- **Testing**: Lightweight database for integration tests
- **Education**: Learn PostgreSQL wire protocol implementation

## Limitations

- **Read-only**: No write operations (INSERT/UPDATE/DELETE rejected)
- **Simple authentication**: Username/password via env vars (cleartext)
- **No TLS/SSL** support
- **Limited SQL**: SELECT only, no JOINs, subqueries, or complex operations
- **No prepared statement parameters**
- **No transactions or locks**
- **Single-threaded**: Not for production use
- **No persistence beyond JSON files**: Edit JSON files directly to update data
- **Schema-based organization**: Tables must be organized in schema subdirectories

## Local Development

Requires [Bun](https://bun.sh):

```bash
bun install

# Run with hot reload (uses defaults: postgres/postgres)
bun run dev

# Or customize credentials with .env
cp .env.example .env
# Edit .env to set custom POSTGRES_USER and POSTGRES_PASSWORD
bun run dev
```

## Publishing to Docker Hub

```bash
# Build the image
docker build -t your-dockerhub-username/prospect-park .

# Tag versions
docker tag your-dockerhub-username/prospect-park:latest \
  your-dockerhub-username/prospect-park:1.0.0

# Push to Docker Hub
docker push your-dockerhub-username/prospect-park:latest
docker push your-dockerhub-username/prospect-park:1.0.0
```

## License

MIT
