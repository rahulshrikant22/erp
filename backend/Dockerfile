FROM node:20-alpine
WORKDIR /app

# Install native build tools for bcrypt
RUN apk add --no-cache python3 make g++

# Copy only backend package.json and install directly (no workspace)
COPY backend/package.json ./
RUN npm install --legacy-peer-deps

# Copy prisma schema and generate client
COPY backend/prisma ./prisma
RUN npx prisma generate

# Copy source and build
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npx tsc -p tsconfig.json

# Cleanup
RUN apk del python3 make g++ && rm -rf /root/.cache /tmp/*

ENV NODE_ENV=production
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["sh", "-c", "npx prisma migrate deploy 2>&1; node dist/index.js"]
