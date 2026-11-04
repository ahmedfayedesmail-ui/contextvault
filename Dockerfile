FROM node:22-slim

ENV PORT=3737 \
    OLLAMA_URL=http://127.0.0.1:11434 \
    DATABASE_PATH=/app/data/contextvault.db \
    NODE_OPTIONS=--experimental-sqlite

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Install the official Ollama Linux runtime inside the application container.
RUN curl -fsSL https://ollama.com/install.sh | sh

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build \
    && npm prune --omit=dev \
    && mkdir -p /app/data \
    && chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3737 11434
VOLUME ["/app/data", "/root/.ollama"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]
