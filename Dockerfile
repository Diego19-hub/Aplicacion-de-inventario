FROM node:24-bookworm-slim AS client-build

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/

RUN npm --prefix client ci

COPY . .

RUN npm run build


FROM node:24-bookworm-slim AS production-dependencies

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force


FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .
COPY --from=client-build --chown=node:node /app/client/dist ./client/dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "start"]