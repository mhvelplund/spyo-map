FROM node:22-alpine AS build

WORKDIR /app

# Copy workspace manifests and install dependencies
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/

RUN npm ci

# Copy source and build
COPY packages/shared/ ./packages/shared/
COPY packages/frontend/ ./packages/frontend/

RUN npm run build --workspace=packages/frontend


FROM nginx:alpine AS serve

# Copy built assets
COPY --from=build /app/packages/frontend/dist /usr/share/nginx/html

# nginx config with /api proxy and SPA fallback
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
\n\
    location /api/ {\n\
        proxy_pass http://backend:3001;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
    }\n\
\n\
    location / {\n\
        root /usr/share/nginx/html;\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
