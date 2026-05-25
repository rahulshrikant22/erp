FROM node:20-alpine AS builder
WORKDIR /app

COPY frontend/package.json ./package.json

# Generate a package-lock.json for frontend only and install
RUN npm install

# Copy frontend source
COPY frontend/ ./

# Build Next.js
ENV BASE_PATH=/erp
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
