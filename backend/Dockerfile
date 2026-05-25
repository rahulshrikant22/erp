FROM node:20-alpine AS builder
WORKDIR /app

# Copy root package files (workspace root)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install all workspace deps from root
RUN npm ci

# Copy backend source
COPY backend/prisma ./backend/prisma
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src

# Generate Prisma and build
WORKDIR /app/backend
RUN npx prisma generate
RUN npx tsc -p tsconfig.json

FROM node:20-alpine AS runner
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

ENV NODE_ENV=production
EXPOSE 4000
WORKDIR /app/backend
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
