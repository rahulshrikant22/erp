FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache curl && \
    curl -fSL "https://github.com/rahulshrikant22/erp/releases/download/frontend-latest/frontend-standalone.tar.gz" \
      -o /tmp/app.tar.gz && \
    tar xzf /tmp/app.tar.gz -C /app && \
    rm /tmp/app.tar.gz && \
    apk del curl

ENV NODE_ENV=production
ENV BASE_PATH=/erp
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000
CMD ["node", "server.js"]
