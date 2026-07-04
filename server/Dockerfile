FROM node:24-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src src

RUN npm run build

FROM node:24-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist dist

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080

# The entrypoint starts as root only to chown the Fly /data volume to the
# node user, then drops privileges before exec'ing the server (setpriv).
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
