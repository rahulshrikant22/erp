FROM node:20-alpine AS builder
WORKDIR /app

COPY frontend/package.json ./package.json

# Install all deps (force development to include devDependencies even if
# Coolify injects NODE_ENV=production as build-time env)
RUN NODE_ENV=development npm install

# Copy frontend source
COPY frontend/ ./

# Build Next.js (limit heap to avoid OOM on small VPS)
ENV BASE_PATH=/erp
ENV NODE_OPTIONS="--max-old-space-size=512"
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV BASE_PATH=/erp
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
