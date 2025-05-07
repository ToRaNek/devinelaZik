# Dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN mkdir -p prisma
COPY prisma/schema.prisma ./prisma/
RUN apt-get update -y && apt-get install -y openssl ca-certificates
RUN npm install undici@^7
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates curl procps && \
    rm -rf /var/lib/apt/lists/*
COPY --from=builder /app /app
RUN npx prisma generate
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/socket-health || exit 1
CMD ["npm", "start"]
