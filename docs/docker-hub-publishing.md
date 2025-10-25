# Publishing Prospect Park to Docker Hub

**✅ Image Published!** The Prospect Park image is now available at:
- **Docker Hub:** https://hub.docker.com/r/sppamlitte/prospect-park
- **Pull command:** `docker pull sppamlitte/prospect-park:latest`

This guide walks you through how the image was published and how to update it in the future.

## Prerequisites

- [x] Docker Desktop installed and running
- [x] Docker Hub account created (https://hub.docker.com)
- [ ] Docker CLI logged in

## Step 1: Log In to Docker Hub via CLI

Even though you're logged in via browser, you need to authenticate the Docker CLI:

```bash
docker login
```

You'll be prompted for:
- **Username**: Your Docker Hub username
- **Password**: Your Docker Hub password (or access token)

**Output should be:**
```
Login Succeeded
```

### Using Access Token (Recommended)

For better security, use an access token instead of your password:

1. Go to https://hub.docker.com/settings/security
2. Click "New Access Token"
3. Name it (e.g., "prospect-park-cli")
4. Copy the token
5. Use it as the password when running `docker login`

---

## Step 2: Build the Image with Your Username

Replace `sppamlitte` with your actual Docker Hub username:

```bash
docker build -t sppamlitte/prospect-park:latest .
```

**Example:**
```bash
# If your username is "johndoe"
docker build -t johndoe/prospect-park:latest .
```

**Expected output:**
```
[+] Building 45.2s (10/10) FINISHED
 => [internal] load build definition
 => [internal] load .dockerignore
 => [internal] load metadata
 => [1/5] FROM oven/bun:1
 => [2/5] WORKDIR /app
 => [3/5] COPY package.json bun.lockb ./
 => [4/5] RUN bun install --frozen-lockfile
 => [5/5] COPY . .
 => exporting to image
 => => naming to docker.io/sppamlitte/prospect-park:latest
```

---

## Step 3: Tag Multiple Versions (Optional but Recommended)

Tag your image with a version number in addition to `latest`:

```bash
# Tag with version 1.0.0
docker tag sppamlitte/prospect-park:latest \
  sppamlitte/prospect-park:1.0.0

# Tag with major version
docker tag sppamlitte/prospect-park:latest \
  sppamlitte/prospect-park:1
```

**Why multiple tags?**
- `latest` - Always points to newest version
- `1.0.0` - Specific version for reproducibility
- `1` - Latest version of major release

---

## Step 4: Verify the Image Locally

Check that your image was created:

```bash
docker images | grep prospect-park
```

**Expected output:**
```
sppamlitte/prospect-park   latest   abc123def456   2 minutes ago   500MB
sppamlitte/prospect-park   1.0.0    abc123def456   2 minutes ago   500MB
sppamlitte/prospect-park   1        abc123def456   2 minutes ago   500MB
```

---

## Step 5: Test the Image Locally

Before pushing, test that it works:

```bash
docker run -d \
  --name prospect-park-test \
  -p 5432:5432 \
  -e POSTGRES_DB=bookstore \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -v $(pwd)/data:/app/data \
  sppamlitte/prospect-park:latest
```

**Test connection:**
```bash
psql postgresql://postgres:postgres@localhost:5432/bookstore -c "SELECT 1;"
```

**Stop and remove test container:**
```bash
docker stop prospect-park-test
docker rm prospect-park-test
```

---

## Step 6: Push to Docker Hub

Push the `latest` tag:

```bash
docker push sppamlitte/prospect-park:latest
```

**Expected output:**
```
The push refers to repository [docker.io/sppamlitte/prospect-park]
abc123def456: Pushed
def456ghi789: Pushed
...
latest: digest: sha256:... size: 1234
```

Push version tags (if you created them):

```bash
docker push sppamlitte/prospect-park:1.0.0
docker push sppamlitte/prospect-park:1
```

---

## Step 7: Verify on Docker Hub

1. Go to https://hub.docker.com
2. Click on your repositories
3. You should see `prospect-park`
4. Click on it to see tags and details

---

## Step 8: Add Repository Description (Optional)

1. Go to your repository on Docker Hub
2. Click on the repository
3. Edit the description:

```markdown
# Prospect Park - PostgreSQL-compatible JSON Database

A lightweight PostgreSQL wire-protocol compatible database server that reads JSON files as database tables. Perfect for demos, prototyping, and development.

## Features
- PostgreSQL wire protocol compatible
- Multi-schema and multi-database support
- JSON-based storage
- Read-only operations
- Docker-ready with graceful shutdown
- Configurable query delays for testing

## Quick Start

docker run -p 5432:5432 \
  -e POSTGRES_DB=bookstore \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -v $(pwd)/data:/app/data \
  sppamlitte/prospect-park

## Documentation
https://github.com/SppamLite/prospect_park
```

---

## Step 9: Test Pulling from Docker Hub

Test that others can pull your image:

```bash
# Remove local images
docker rmi sppamlitte/prospect-park:latest

# Pull from Docker Hub
docker pull sppamlitte/prospect-park:latest

# Run it
docker run -d -p 5432:5432 \
  -e POSTGRES_DB=bookstore \
  sppamlitte/prospect-park:latest
```

---

## Step 10: Update Documentation

Update your documentation files to reference your Docker Hub image:

### README.md

Replace `your-dockerhub-username` with your actual username throughout the file.

### docker-compose.yml

Update the image reference:

```yaml
services:
  db:
    image: sppamlitte/prospect-park:latest
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: bookstore
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - ./data:/app/data
```

---

## Usage Examples

### Pull and Run

```bash
docker pull sppamlitte/prospect-park:latest

docker run -d \
  --name my-prospect-park \
  -p 5432:5432 \
  -e POSTGRES_DB=bookstore \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -v $(pwd)/data:/app/data \
  sppamlitte/prospect-park:latest
```

### With docker-compose

```yaml
services:
  db:
    image: sppamlitte/prospect-park:1.0.0
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: bookstore
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - ./data:/app/data
```

### With Query Delay

```bash
docker run -d \
  -p 5432:5432 \
  -e POSTGRES_DB=bookstore \
  -e QUERY_DELAY=30 \
  sppamlitte/prospect-park:latest
```

---

## Publishing Updates

When you make changes and want to publish a new version:

### For Patch Updates (1.0.0 → 1.0.1)

```bash
# Build with new version
docker build -t sppamlitte/prospect-park:1.0.1 .

# Tag as latest
docker tag sppamlitte/prospect-park:1.0.1 \
  sppamlitte/prospect-park:latest

# Push both
docker push sppamlitte/prospect-park:1.0.1
docker push sppamlitte/prospect-park:latest
```

### For Minor Updates (1.0.0 → 1.1.0)

```bash
docker build -t sppamlitte/prospect-park:1.1.0 .
docker tag sppamlitte/prospect-park:1.1.0 \
  sppamlitte/prospect-park:1
docker tag sppamlitte/prospect-park:1.1.0 \
  sppamlitte/prospect-park:latest

docker push sppamlitte/prospect-park:1.1.0
docker push sppamlitte/prospect-park:1
docker push sppamlitte/prospect-park:latest
```

---

## Troubleshooting

### "unauthorized: incorrect username or password"

Run `docker login` again and make sure you're using the correct credentials.

### "denied: requested access to the resource is denied"

Make sure the repository name matches your username:
- ✅ Correct: `johndoe/prospect-park`
- ❌ Wrong: `prospect-park` (missing username)

### Image Too Large

If your image is very large:
1. Check what's being copied with `.dockerignore`
2. Use multi-stage builds
3. Minimize layers

### Build Fails

```bash
# Clean build with no cache
docker build --no-cache -t sppamlitte/prospect-park:latest .
```

---

## Automation with GitHub Actions (Future)

Create `.github/workflows/docker-publish.yml`:

```yaml
name: Publish Docker Image

on:
  push:
    tags:
      - 'v*'

jobs:
  push_to_registry:
    runs-on: ubuntu-latest
    steps:
      - name: Check out the repo
        uses: actions/checkout@v3

      - name: Log in to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v4
        with:
          images: sppamlitte/prospect-park

      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

---

## Summary

**Quick Commands (replace sppamlitte):**

```bash
# 1. Login
docker login

# 2. Build
docker build -t sppamlitte/prospect-park:latest .

# 3. Tag versions
docker tag sppamlitte/prospect-park:latest \
  sppamlitte/prospect-park:1.0.0

# 4. Test locally
docker run -d -p 5432:5432 \
  -e POSTGRES_DB=bookstore \
  sppamlitte/prospect-park:latest

# 5. Push
docker push sppamlitte/prospect-park:latest
docker push sppamlitte/prospect-park:1.0.0

# 6. Verify
docker pull sppamlitte/prospect-park:latest
```

---

## Next Steps

After publishing:
1. ✅ Update all documentation with your Docker Hub username
2. ✅ Share the pull command with users
3. ✅ Consider adding a badge to README.md
4. ✅ Set up automated builds (optional)

**Docker Hub Badge for README:**

```markdown
![Docker Pulls](https://img.shields.io/docker/pulls/sppamlitte/prospect-park)
![Docker Image Size](https://img.shields.io/docker/image-size/sppamlitte/prospect-park)
```

Happy publishing! 🚀
