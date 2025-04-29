# Dockerfile
FROM node:18-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
# Create prisma directory and copy schema
RUN mkdir -p prisma
COPY prisma/schema.prisma ./prisma/
# Install OpenSSL - Add this line
RUN apt-get update -y && apt-get install -y openssl
RUN npm install
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:18-slim AS runner
WORKDIR /app
# Install OpenSSL in the runner stage too
RUN apt-get update -y && apt-get install -y openssl netcat-traditional && rm -rf /var/lib/apt/lists/*
# Copy all files from builder
COPY --from=builder /app /app
# Copy wait-for-it script
COPY wait-for-it.sh /usr/local/bin/wait-for-it.sh
RUN chmod +x /usr/local/bin/wait-for-it.sh
# Run Prisma generate again in the runner stage to make sure the client is available
RUN npx prisma generate
EXPOSE 3000
CMD ["sh", "-c", "/usr/local/bin/wait-for-it.sh postgres 5432 -- node server.js"]