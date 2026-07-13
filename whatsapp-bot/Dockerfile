FROM node:20-alpine

# cache-bust: 2026-05-28
WORKDIR /app

# Ferramentas de build para módulos nativos do Baileys
RUN apk add --no-cache python3 make g++ git

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/index.js"]
