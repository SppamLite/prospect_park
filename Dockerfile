# Use official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Expose default PostgreSQL port
EXPOSE 5432

# Run the server
CMD ["bun", "run", "index.ts"]
