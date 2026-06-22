FROM node:20-slim
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN apt-get update -qq && apt-get install -y -qq netcat-openbsd >/dev/null && \
    npm install --workspaces --include-workspace-root
ARG BUILD_ID=dev-local
ENV BUILD_ID=$BUILD_ID
# Compile TypeScript at build time — avoids ts-node heap spike at startup.
# Temporal's workflow bundler (webpack) still runs at process start since it
# needs the runtime environment to resolve activity imports.
WORKDIR /app/apps/worker
RUN npx tsc --project tsconfig.json
COPY scripts/wait-for.sh /wait-for.sh
RUN chmod +x /wait-for.sh
CMD ["/wait-for.sh", "temporal:7233", "--", "node", "dist/worker.js"]
