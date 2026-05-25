FROM node:20-alpine
WORKDIR /app

# Install build tools needed for bcrypt native module
RUN apk add --no-cache python3 make g++

# Copy root package files
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install all deps
RUN npm ci

# Copy backend source
COPY backend/prisma ./backend/prisma
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src

# Generate Prisma client
WORKDIR /app/backend
RUN npx prisma generate

# Build TypeScript
RUN npx tsc -p tsconfig.json

# Clean up build tools
RUN apk del python3 make g++

ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
