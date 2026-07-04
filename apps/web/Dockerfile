FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm ci --workspaces --include-workspace-root
WORKDIR /app/apps/web
ARG VITE_PASSWORD_AUTH_ENABLED=true
ARG VITE_GOOGLE_AUTH_ENABLED=false
ENV VITE_PASSWORD_AUTH_ENABLED=$VITE_PASSWORD_AUTH_ENABLED
ENV VITE_GOOGLE_AUTH_ENABLED=$VITE_GOOGLE_AUTH_ENABLED
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
