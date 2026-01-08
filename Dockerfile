# Dockerfile for Backend Server
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including tsx for TypeScript execution)
RUN npm ci

# Copy server code and TypeScript configs
COPY server ./server
COPY tsconfig.json ./

# Copy scripts directory for Cloudflare tunnel automation
COPY scripts ./scripts
RUN chmod +x scripts/*.sh

# Install cloudflared for tunnel management
RUN apk add --no-cache curl bash ca-certificates \
    && curl -L --output /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/download/2024.12.0/cloudflared-linux-amd64 \
    && mv /tmp/cloudflared /usr/local/bin/cloudflared \
    && chmod +x /usr/local/bin/cloudflared \
    && cloudflared --version

# Expose the port the app runs on
EXPOSE 3001

# Set environment variable for port
ENV PORT=3001

# Run the server using tsx (TypeScript execution)
CMD ["npx", "tsx", "server/index.ts"]
