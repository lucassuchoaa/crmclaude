# Stage 1: Build frontend
FROM node:20.18-alpine3.20 AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Stage 2: Production
FROM node:20.18-alpine3.20

RUN apk add --no-cache tini su-exec python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && apk del python3 make g++

COPY server/ ./server/
COPY --from=builder /app/dist ./dist/

# Ensure data directory exists and app files are readable by node user
RUN mkdir -p server/data && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Use entrypoint that fixes data dir ownership then drops to non-root
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "chown -R node:node /app/server/data && exec su-exec node node server/index.js"]
