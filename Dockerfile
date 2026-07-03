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

# La CLI GitHub (`gh`) permet à l'agent de relecture de consulter la PR et
# d'approuver ou de demander des changements directement dessus. Elle
# s'authentifie au runtime via la variable d'environnement GITHUB_TOKEN.
# `git` est requis par `gh repo clone` / `gh pr checkout` pour préparer le
# checkout local du code des PR relues.
# `bash` est requis par l'outil Bash de la CLI Claude : le `sh` de busybox
# (Alpine) est refusé (« No suitable shell found »), même avec SHELL défini.
RUN apk add --no-cache bash git github-cli

# Utilisateur non-root avec un UID/GID fixes et prévisibles. Fixer l'UID permet
# d'aligner les permissions du volume ~/.claude monté depuis l'hôte
# (surchargeable via l'argument de build UID/GID si besoin).
ARG UID=1001
ARG GID=1001
ENV HOME=/home/botuser
# Shell POSIX pour l'outil Bash de la CLI Claude (voir apk add ci-dessus).
ENV SHELL=/bin/bash
# Workspace de relecture : le défaut du code (.review-workspace, relatif au
# cwd /usr/src/app) n'est pas inscriptible par botuser — on fixe un chemin
# dans $HOME, surchargeable au runtime (et monté en volume en production).
ENV PR_REVIEW_WORKSPACE_DIR=${HOME}/review-workspace
RUN addgroup -S -g "${GID}" botgroup \
  && adduser -S -u "${UID}" -G botgroup -h "${HOME}" botuser \
  && mkdir -p "${HOME}/.claude" "${HOME}/review-workspace" \
  && chown -R botuser:botgroup "${HOME}"

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package.json ./

USER botuser
CMD ["node", "dist/app.js"]
