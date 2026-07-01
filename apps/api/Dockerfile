FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY server/ ./server/
COPY database/ ./database/
COPY private/ ./private/
COPY public/ ./public/
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV DB_PATH=/data/platform.db
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["tini", "--", "/app/entrypoint.sh"]
