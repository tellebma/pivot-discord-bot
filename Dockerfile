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

# La CLI Claude Code est embarquée dans l'image (Option A : conteneur autonome).
# L'authentification est fournie au runtime : soit ANTHROPIC_API_KEY (recommandé),
# soit un montage de ~/.claude (abonnement Pro/Max).
RUN npm install -g @anthropic-ai/claude-code

# Utilisateur non-root avec un UID/GID fixes et prévisibles. Fixer l'UID permet
# d'aligner les permissions du volume ~/.claude monté depuis l'hôte
# (surchargeable via l'argument de build UID/GID si besoin).
ARG UID=1001
ARG GID=1001
ENV HOME=/home/botuser
RUN addgroup -S -g "${GID}" botgroup \
  && adduser -S -u "${UID}" -G botgroup -h "${HOME}" botuser \
  && mkdir -p "${HOME}/.claude" \
  && chown -R botuser:botgroup "${HOME}"

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package.json ./

USER botuser
CMD ["node", "dist/app.js"]
