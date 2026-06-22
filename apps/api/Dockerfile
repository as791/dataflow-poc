FROM node:20-slim
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN apt-get update -qq && apt-get install -y -qq netcat-openbsd >/dev/null && \
    npm install --workspaces --include-workspace-root
# Compile TypeScript at build time — avoids ts-node heap spike at startup.
WORKDIR /app/apps/api
RUN npx tsc --project tsconfig.json && \
    cp -r src/email/templates dist/email/
COPY scripts/wait-for.sh /wait-for.sh
RUN chmod +x /wait-for.sh
CMD ["/wait-for.sh", "temporal:7233", "--", "node", "dist/index.js"]
