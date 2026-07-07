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
COPY database/schema.sql ./database/schema.sql
COPY public/ ./public/
COPY private/ ./private/
COPY entrypoint.sh ./entrypoint.sh

RUN chmod +x entrypoint.sh

ENV DB_PATH=/data/platform.db
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["tini", "--", "/app/entrypoint.sh"]
