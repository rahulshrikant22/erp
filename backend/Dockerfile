FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN NODE_ENV=development npm install

COPY prisma ./prisma
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

RUN apk del python3 make g++

ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
