FROM oven/bun:latest

WORKDIR /app
COPY . .

# Install curl (Debian-based)
RUN apt-get update && apt-get install -y curl --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN bun install

EXPOSE 3000

# Healthcheck using curl
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run your app
CMD ["bun", "run", "index.ts"]
