# Dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN mkdir -p prisma
COPY prisma/schema.prisma ./prisma/
RUN apt-get update -y && apt-get install -y openssl ca-certificates
RUN npm install undici@^7

ENV DATABASE_URL="postgresql://postgres.jkdywcrnfdikvwdowffz:QCpVxQp2MRVX0o2X@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
ENV DIRECT_URL="postgresql://postgres.jkdywcrnfdikvwdowffz:QCpVxQp2MRVX0o2X@aws-0-us-east-2.pooler.supabase.com:5432/postgres"


RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates curl procps && \
    rm -rf /var/lib/apt/lists/*
COPY --from=builder /app /app

ENV DATABASE_URL="postgresql://postgres.jkdywcrnfdikvwdowffz:QCpVxQp2MRVX0o2X@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
ENV DIRECT_URL="postgresql://postgres.jkdywcrnfdikvwdowffz:QCpVxQp2MRVX0o2X@aws-0-us-east-2.pooler.supabase.com:5432/postgres"

RUN npx prisma generate
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/socket-health || exit 1
CMD ["npm", "start"]
