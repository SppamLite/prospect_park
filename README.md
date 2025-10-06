# Prospect Park - PostgreSQL-compatible JSON Database

A lightweight PostgreSQL wire-protocol compatible database server that reads JSON files as database tables. Perfect for demos, prototyping, and development environments.

## Features

- **PostgreSQL Compatible**: Works with any PostgreSQL client (psql, TablePlus, pgAdmin, TypeORM, etc.)
- **Read-Only**: Perfect for demo/testing - rejects all write operations (INSERT/UPDATE/DELETE)
- **JSON-based Storage**: Each `.json` file = one table (simple and portable)
- **Type-Safe**: Built with TypeScript and runtime validation via Zod
- **Bun-Powered**: Fast startup and execution using Bun runtime
- **Docker Ready**: Drop-in replacement for PostgreSQL in docker-compose
- **Required Authentication**: Simple user/password auth via environment variables
- **Structured Logging**: Pino logger with pretty output in development

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

Create JSON files in `./data/<database>/` directory:

```
data/
└── bookstore/
    ├── books.json
    └── authors.json
```

Each JSON file must contain an **array of objects**:

```json
[
  { "id": 1, "title": "The Great Gatsby", "price": 12.99 },
  { "id": 2, "title": "1984", "price": 14.99 }
]
```

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

- `SELECT * FROM table [WHERE col = literal] [LIMIT n]`
- `SELECT col1, col2 FROM table [WHERE col = literal] [LIMIT n]`
- `SELECT count(*) FROM table [WHERE col = literal]`
- `SELECT 1` (connection testing)

**❌ Write operations are rejected:**

- INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, etc.
- Server returns error: "Write operations not supported - this is a read-only database"

## Use Cases

- **Demo applications**: Quick PostgreSQL-compatible database for demos
- **Prototyping**: Test backend frameworks without setting up PostgreSQL
- **Development**: Local development with JSON files as version-controlled data
- **Testing**: Lightweight database for integration tests
- **Education**: Learn PostgreSQL wire protocol implementation

## Limitations

- **Read-only**: No write operations (INSERT/UPDATE/DELETE rejected)
- **Simple authentication**: Username/password via env vars (required)
- **No TLS/SSL** support
- **Very limited SQL**: SELECT only, no JOINs, subqueries, or complex operations
- **No prepared statement parameters**
- **Single-threaded**: Not for production use
- **No persistence beyond JSON files**: Edit JSON files directly to update data

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
