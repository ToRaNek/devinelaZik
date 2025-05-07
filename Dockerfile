# Étape de build
FROM node:20-slim AS builder
WORKDIR /app

# 1. Copier package.json et package-lock.json
#    Puis installer les dépendances
COPY package.json package-lock.json* ./
RUN npm install

# 2. Copier le schéma Prisma et générer le client
RUN mkdir -p prisma
COPY prisma/schema.prisma ./prisma/
RUN apt-get update -y && apt-get install -y openssl ca-certificates
RUN npm install undici@^7
# Injection des variables Supabase pour Prisma
ENV DATABASE_URL="postgresql://postgres.jkdywcrnfdikvwdowffz:QCpVxQp2MRVX0o2X@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
ENV DIRECT_URL="postgresql://postgres.jkdywcrnfdikvwdowffz:QCpVxQp2MRVX0o2X@aws-0-us-east-2.pooler.supabase.com:5432/postgres"
RUN npx prisma generate

# 3. Copier tout le code et builder Next.js
COPY . .
RUN npm run build


# Étape runtime
FROM node:20-slim AS runner
WORKDIR /app

# 1. Installer les libs système nécessaires
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates curl procps && \
    rm -rf /var/lib/apt/lists/*

# 2. Copier l'app depuis le builder
COPY --from=builder /app /app

# 3. Réinjecter les variables pour Prisma en runtime
ENV DATABASE_URL="postgresql://postgres.jkdywcrnfdikvwdowffz:QCpVxQp2MRVX0o2X@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
ENV DIRECT_URL="postgresql://postgres.jkdywcrnfdikvwdowffz:QCpVxQp2MRVX0o2X@aws-0-us-east-2.pooler.supabase.com:5432/postgres"
RUN npx prisma generate

# 4. Exposer le port et healthcheck
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/socket-health || exit 1

# 5. Démarrage en prod sur Render
#    Render expose automatiquement votre app sur
#    https://devinela-zik-wait-for-it.onrender.com
CMD ["npm", "node server.js"]
