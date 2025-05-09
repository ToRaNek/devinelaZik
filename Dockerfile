# Étape de build
FROM node:20-slim AS builder
WORKDIR /app

# Copier package.json et les dépendances
COPY package.json ./

# Copier le schéma Prisma et générer le client
RUN mkdir -p prisma
COPY prisma/schema.prisma ./prisma/
RUN apt-get update -y && apt-get install -y openssl ca-certificates

# Base de données Supabase pour Prisma (utiliser ARG/ENV)
ARG DATABASE_URL
ARG DIRECT_URL
ENV DATABASE_URL=${DATABASE_URL}
ENV DIRECT_URL=${DIRECT_URL}
RUN npx prisma generate

# Copier tout le code et builder Next.js
COPY . .
RUN npm run build

# Étape runtime
FROM node:20-slim AS runner
WORKDIR /app

# Installer les libs système nécessaires
RUN apt-get update -y && \
    apt-get install -y openssl ca-certificates curl procps && \
    rm -rf /var/lib/apt/lists/*

# Copier l'app depuis le builder
COPY --from=builder /app /app

# Accepter le token GitHub comme ARG
ARG GIT_AUTH_TOKEN
ENV GIT_AUTH_TOKEN=${GIT_AUTH_TOKEN}

# Re-générer Prisma
ARG DATABASE_URL
ARG DIRECT_URL
ENV DATABASE_URL=${DATABASE_URL}
ENV DIRECT_URL=${DIRECT_URL}
RUN npx prisma generate

# Exposer le port et healthcheck
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/socket-health || exit 1

# Démarrage en prod sur Render
CMD ["sh", "-c", "node server.js"]