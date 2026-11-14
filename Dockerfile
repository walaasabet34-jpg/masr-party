# Works on any container host (Render, Fly.io, Railway, Koyeb...). Single instance: rooms are in memory.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
EXPOSE 8787
CMD ["node", "server/index.js"]
