FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY config/ ./config/

RUN npx tsc
RUN npm prune --omit=dev

EXPOSE ${PORT:-3001}

CMD ["node", "dist/server.js"]
