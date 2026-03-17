# Install dependencies only when needed
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# Rebuild the source code only when needed
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEMO_MODE=false
ARG NEXT_PUBLIC_ENABLE_MOCK_LOGIN=true
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE}
ENV NEXT_PUBLIC_ENABLE_MOCK_LOGIN=${NEXT_PUBLIC_ENABLE_MOCK_LOGIN}

RUN npm run build

# Production image, copy all the files and run next
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Install dependencies for sharp and other image processing if needed
RUN apk add --no-cache libc6-compat

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Fix permissions for image cache
RUN mkdir -p /app/.next/cache/images && chmod -R 777 /app/.next/cache

# Install sharp explicitly in the runner if not already in node_modules
# Usually better to have it in package.json, but user specifically asked for RUN npm install sharp
RUN npm install sharp

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["npm", "start"]
