# Étape de build
FROM node:20-slim AS builder
WORKDIR /app

# 1. Copier package.json et installer les dépôts
COPY package.json package-lock.json* ./
RUN npm ci

# 2. Copier et générer le client Prisma
RUN mkdir -p prisma
COPY prisma/schema.prisma ./prisma/
RUN apt-get update -y && apt-get install -y openssl ca-certificates
RUN npm install undici@^7

# ► Injection des variables pour Supabase pendant le build
ENV DATABASE_URL="postgresql://postgres.jkdywcrnfdikvwdowffz:QCpVxQp2MRVX0o2X@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
ENV DIRECT_URL="postgresql://postgres.jkdywcrnfdikvwdowffz:QCpVxQp2MRVX0o2X@aws-0-us-east-2.pooler.supabase.com:5432/postgres"

RUN npx prisma generate

# 3. Copier tout le code et builder Next.js
COPY . .
RUN npm run build


# Étape runtime
FROM node:20-slim AS runner
WORKDIR /app

# 1. Installer les libs système requises
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates curl procps && \
    rm -rf /var/lib/apt/lists/*

# 2. Copier l'app issue du builder
COPY --from=builder /app /app

# 3. (Re)générer le client Prisma pour s'assurer qu'il est bien présent
ENV DATABASE_URL="postgresql://postgres.jkdywcrnfdikvwdowffz:QCpVxQp2MRVX0o2X@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
ENV DIRECT_URL="postgresql://postgres.jkdywcrnfdikvwdowffz:QCpVxQp2MRVX0o2X@aws-0-us-east-2.pooler.supabase.com:5432/postgres"
RUN npx prisma generate

# 4. Exposer le port et healthcheck
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/socket-health || exit 1

# 5. Démarrage en production (lance le serveur custom avec Socket.IO)
CMD ["npm", "start"]
