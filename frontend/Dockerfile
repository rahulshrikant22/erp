FROM node:20-alpine AS builder
WORKDIR /app

# Copy root lockfile and workspace package.json files
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install all deps
RUN npm ci --workspace=frontend

# Copy frontend source
COPY frontend/ ./frontend/

# Build Next.js with basePath
ENV BASE_PATH=/erp
ENV NEXT_PUBLIC_API_URL=/erp/api
WORKDIR /app/frontend
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV BASE_PATH=/erp
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder /app/frontend/public ./frontend/public

EXPOSE 3000
CMD ["node", "frontend/server.js"]
