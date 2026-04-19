FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace root manifests
COPY package.json package-lock.json ./

# Copy extractor package
COPY packages/extractor ./packages/extractor

RUN npm ci --workspace=packages/extractor --include-workspace-root

WORKDIR /app/packages/extractor
RUN npm run build


# WORKDIR /app
# COPY package*.json ./
# RUN npm ci
# COPY . .
# RUN npm run build

# FROM node:22-alpine
# WORKDIR /app
# COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/node_modules ./node_modules
# CMD ["node", "dist/index.js"]

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/packages/extractor/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/index.js"]
