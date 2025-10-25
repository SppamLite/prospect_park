# Multi-Instance Docker Compose Setup

This guide shows how to run multiple Prospect Park instances simultaneously with different configurations.

## Architecture

The `docker-compose.multi.yml` configuration runs **3 independent database servers**:

| Instance | Port | Database  | User     | Password   | Features        |
| -------- | ---- | --------- | -------- | ---------- | --------------- |
| db1      | 5432 | bookstore | postgres | postgres   | Normal speed    |
| db2      | 5433 | ecommerce | admin    | admin123   | 10s query delay |
| db3      | 5434 | analytics | analyst  | analyst456 | Debug logging   |

All instances share the same `./data` directory but connect to different databases.

## Prerequisites

1. **Docker Desktop** must be running
2. **Data directories** must exist (already created):
   ```
   data/
   ├── bookstore/
   │   ├── public/
   │   └── sales/
   ├── ecommerce/
   │   ├── public/
   │   ├── inventory/
   │   └── orders/
   └── analytics/
       ├── public/
       └── reports/
   ```

## Quick Start

### Start All Instances

```bash
docker-compose -f docker-compose.multi.yml up
```

Or run in background:

```bash
docker-compose -f docker-compose.multi.yml up -d
```

### Start Specific Instances

```bash
# Start only bookstore database
docker-compose -f docker-compose.multi.yml up db1

# Start bookstore and ecommerce
docker-compose -f docker-compose.multi.yml up db1 db2
```

### Stop All Instances

```bash
docker-compose -f docker-compose.multi.yml down
```

## Connection Details

### Instance 1: Bookstore (Normal Speed)

```bash
# Connection string
postgresql://postgres:postgres@localhost:5432/bookstore

# psql
psql postgresql://postgres:postgres@localhost:5432/bookstore

# TablePlus
Host: localhost
Port: 5432
Database: bookstore
User: postgres
Password: postgres
```

**Features:**

- Normal query speed
- Default PostgreSQL-compatible credentials
- Info-level logging

**Test queries:**

```sql
-- List tables
SHOW TABLES;

-- Query books
SELECT * FROM books;

-- Query sales records
SELECT * FROM sales.records;
```

---

### Instance 2: Ecommerce (With Query Delay)

```bash
# Connection string
postgresql://admin:admin123@localhost:5433/ecommerce

# psql
psql postgresql://admin:admin123@localhost:5433/ecommerce

# TablePlus
Host: localhost
Port: 5433
Database: ecommerce
User: admin
Password: admin123
```

**Features:**

- **10 second delay** on all data queries (SELECT, COUNT)
- Metadata queries remain instant
- Perfect for testing timeout handling
- Info-level logging

**Test queries:**

```sql
-- Fast (metadata query)
SHOW TABLES;

-- Slow (data query, 10s delay)
SELECT * FROM products;

-- Fast (metadata query)
SELECT * FROM information_schema.tables;

-- Slow (data query, 10s delay)
SELECT * FROM inventory.products;
```

---

### Instance 3: Analytics (Debug Mode)

```bash
# Connection string
postgresql://analyst:analyst456@localhost:5434/analytics

# psql
psql postgresql://analyst:analyst456@localhost:5434/analytics

# TablePlus
Host: localhost
Port: 5434
Database: analytics
User: analyst
Password: analyst456
```

**Features:**

- Normal query speed
- **Debug-level logging** (verbose output)
- Great for troubleshooting
- See all protocol messages

**Test queries:**

```sql
-- Query events
SELECT * FROM events;

-- Query monthly sales report
SELECT * FROM reports.monthly_sales;
```

---

## Viewing Logs

### All Instances

```bash
docker-compose -f docker-compose.multi.yml logs -f
```

### Specific Instance

```bash
# Bookstore logs
docker-compose -f docker-compose.multi.yml logs -f db1

# Ecommerce logs (see query delays)
docker-compose -f docker-compose.multi.yml logs -f db2

# Analytics logs (debug mode)
docker-compose -f docker-compose.multi.yml logs -f db3
```

### Recent Logs

```bash
# Last 50 lines
docker-compose -f docker-compose.multi.yml logs --tail=50 db1
```

---

## Testing Scenarios

### 1. Test Graceful Shutdown

```bash
# Start all instances
docker-compose -f docker-compose.multi.yml up -d

# Connect to bookstore
psql postgresql://postgres:postgres@localhost:5432/bookstore

# In another terminal, stop the instance
docker-compose -f docker-compose.multi.yml stop db1

# Check logs
docker-compose -f docker-compose.multi.yml logs db1 | grep "shutdown"
```

Expected output:

```
INFO: Graceful shutdown initiated
  signal: "SIGTERM"
  activeConnections: 1
INFO: Shutdown complete
```

### 2. Test Query Delay

```bash
# Start ecommerce instance (with 10s delay)
docker-compose -f docker-compose.multi.yml up db2

# In another terminal, time a query
time psql postgresql://admin:admin123@localhost:5433/ecommerce -c "SELECT * FROM products;"
```

Expected: ~10 seconds for data query, instant for metadata

### 3. Test Multiple Connections

```bash
# Start all instances
docker-compose -f docker-compose.multi.yml up -d

# Connect to all three simultaneously
psql postgresql://postgres:postgres@localhost:5432/bookstore &
psql postgresql://admin:admin123@localhost:5433/ecommerce &
psql postgresql://analyst:analyst456@localhost:5434/analytics &
```

### 4. Test TablePlus with Multiple Connections

Open TablePlus and create 3 connections:

1. Bookstore (port 5432)
2. Ecommerce (port 5433) - notice the 10s delay
3. Analytics (port 5434)

All should work independently!

---

## Customization

### Change Port Mappings

Edit `docker-compose.multi.yml`:

```yaml
ports:
  - "7000:5432" # Map host 7000 to container 5432
```

### Change Query Delay

```yaml
environment:
  QUERY_DELAY: 30 # 30 second delay instead of 10
```

### Add More Instances

Copy one of the service blocks and modify:

```yaml
db4:
  build: .
  container_name: prospect-park-custom
  ports:
    - "5435:5432"
  environment:
    POSTGRES_DB: mydb
    POSTGRES_USER: myuser
    POSTGRES_PASSWORD: mypass
    PORT: 5432
    LOG_LEVEL: info
  volumes:
    - ./data:/app/data
  restart: unless-stopped
  networks:
    - prospect-park-network
```

---

## Troubleshooting

### Port Already in Use

If you see "port already allocated":

```bash
# Check what's using the port
lsof -i :5432

# Kill the process or change the port in docker-compose.multi.yml
```

### Container Won't Start

```bash
# Check logs
docker-compose -f docker-compose.multi.yml logs db1

# Check if image built successfully
docker images | grep prospect-park

# Rebuild if needed
docker-compose -f docker-compose.multi.yml build
```

### Data Not Loading

Ensure your data directories and JSON files exist:

```bash
# Check structure
tree data/

# Verify JSON files are valid
cat data/bookstore/public/books.json | jq .
```

### Can't Connect

```bash
# Check if container is running
docker-compose -f docker-compose.multi.yml ps

# Check container logs
docker-compose -f docker-compose.multi.yml logs db1

# Test connection
psql postgresql://postgres:postgres@localhost:5432/bookstore -c "SELECT 1;"
```

---

## Cleanup

### Stop and Remove Containers

```bash
docker-compose -f docker-compose.multi.yml down
```

### Remove Images

```bash
docker rmi prospect-park:test
```

### Full Cleanup

```bash
# Stop everything
docker-compose -f docker-compose.multi.yml down

# Remove images
docker rmi $(docker images | grep prospect-park | awk '{print $3}')

# Remove volumes (careful - this deletes data)
docker volume prune
```

---

## Production Considerations

This multi-instance setup is for **local development and testing only**.

For production:

1. Use separate docker-compose files per environment
2. Use Docker secrets for passwords
3. Add health checks
4. Configure resource limits
5. Use external networks
6. Consider orchestration (Kubernetes)

---

## Next Steps

1. Start Docker Desktop
2. Build the image: `docker-compose -f docker-compose.multi.yml build`
3. Start all instances: `docker-compose -f docker-compose.multi.yml up`
4. Connect with your favorite client!

Happy testing! 🚀
