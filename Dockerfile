# Dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# Create prisma directory and copy schema
RUN mkdir -p prisma
COPY prisma/schema.prisma ./prisma/
# Install OpenSSL and other dependencies required for WebSockets
RUN apt-get update -y && apt-get install -y openssl ca-certificates
# Dans la section RUN npm install
RUN npm install http-cookie-agent tough-cookie
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
# Install essential libraries and networking tools for debugging
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates netcat-traditional curl procps && \
    rm -rf /var/lib/apt/lists/*
# Copy all files from builder
COPY --from=builder /app /app
# Copy wait-for-it script
COPY wait-for-it.sh /usr/local/bin/wait-for-it.sh
RUN chmod +x /usr/local/bin/wait-for-it.sh
# Run Prisma generate again in the runner stage to make sure the client is available
RUN npx prisma generate
# Expose port for the application
EXPOSE 3000
# Healthcheck to verify the service is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/socket-health || exit 1
# Command to run the server with proper waiting for dependencies
CMD ["sh", "-c", "/usr/local/bin/wait-for-it.sh postgres 5432 -- node server.js"]