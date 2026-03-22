FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json prisma.config.ts ./
COPY prisma/ ./prisma/
COPY src/ ./src/
COPY config/ ./config/

RUN npx prisma generate
RUN npx tsc --build
RUN npm prune --omit=dev

EXPOSE ${PORT:-3001}

CMD ["node", "dist/server.js"]
