FROM node:20-alpine AS builder
WORKDIR /app

# Copy root lockfile and workspace package.json files
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install all deps (including devDeps for build)
RUN npm ci --workspace=backend

# Copy backend source + prisma
COPY backend/prisma ./backend/prisma
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src

# Generate Prisma client and build TypeScript
WORKDIR /app/backend
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

# Copy root package files for npm workspace resolution
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

# Install production deps only
RUN npm ci --workspace=backend --omit=dev

# Copy built output and prisma
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/backend/node_modules/.prisma ./backend/node_modules/.prisma

ENV NODE_ENV=production
EXPOSE 4000
WORKDIR /app/backend
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
