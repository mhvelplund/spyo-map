FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace root manifests
COPY package.json package-lock.json ./

# Copy shared package (workspace dependency)
COPY packages/shared ./packages/shared

# Copy backend package
COPY packages/backend ./packages/backend

RUN npm ci --workspace=packages/backend --workspace=packages/shared --include-workspace-root

WORKDIR /app/packages/backend
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/server.js"]
