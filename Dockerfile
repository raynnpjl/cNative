FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY shared ./shared
COPY addon ./addon
COPY configure ./configure
COPY tests ./tests
COPY vitest.config.ts ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=7000 CONFIG_PATH=/data/config.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir /data && chown node:node /data
COPY --from=build /app/dist ./dist
USER node
EXPOSE 7000
CMD ["node", "dist/addon/src/index.js"]
