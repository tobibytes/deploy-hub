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

# Expose the port the app runs on
EXPOSE 3001

# Set environment variable for port
ENV PORT=3001

# Run the server using tsx (TypeScript execution)
CMD ["npx", "tsx", "server/index.ts"]
