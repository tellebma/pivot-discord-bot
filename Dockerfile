# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
RUN npm prune --omit=dev

# ---- Production stage ----
FROM node:20-alpine
WORKDIR /usr/src/app
ENV NODE_ENV=production

# La CLI Claude doit être disponible dans l'image pour lancer les relectures.
# Elle est installée globalement via npm ; le conteneur devra disposer d'une
# clé (ANTHROPIC_API_KEY) ou d'une configuration d'authentification montée.
RUN npm install -g @anthropic-ai/claude-code

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package.json ./

# Utilisateur non-root
RUN addgroup -S botgroup && adduser -S botuser -G botgroup
USER botuser
CMD ["node", "dist/app.js"]
