# Pivot Discord Bot

[![CI](https://github.com/tellebma/pivot-discord-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/tellebma/pivot-discord-bot/actions/workflows/ci.yml)
[![CodeQL](https://github.com/tellebma/pivot-discord-bot/actions/workflows/codeql.yml/badge.svg)](https://github.com/tellebma/pivot-discord-bot/actions/workflows/codeql.yml)

Bot Discord de **relecture automatisée de Pull Requests GitHub**.

Le bot surveille un (ou plusieurs) canal(aux) Discord configurable(s). Dès qu'un
lien vers une Pull Request GitHub y est posté, il lance une **relecture complète
par un agent Claude sans contexte**, à l'aide d'un **prompt optimisé**, en
passant par la **CLI Claude installée sur la machine hôte**. Le résultat est
publié dans un fil de discussion attaché au message d'origine.

Construit sur [`template_discord_bot_ts`](https://github.com/tellebma/template_discord_bot_ts)
(TypeScript + discord.js v14) : architecture modulaire (commandes, événements,
composants, crons chargés dynamiquement), logs JSON structurés, gestion d'erreurs
centralisée et intégration Sentry optionnelle.

## Fonctionnement

1. Un utilisateur poste une URL de PR (`https://github.com/owner/repo/pull/123`)
   dans un canal surveillé.
2. Le bot réagit avec 👀, récupère les métadonnées et le **diff complet** de la
   PR via l'API REST GitHub.
3. Il construit un prompt de relecture optimisé (résumé, bugs, sécurité,
   performance, tests, qualité, verdict) puis invoque la CLI Claude en mode
   headless (`claude -p`), **sans historique ni contexte partagé**.
4. La relecture est publiée dans un fil de discussion, et le message est marqué
   ✅ (ou ❌ en cas d'échec).

La commande **`/review url:<lien_PR>`** permet aussi de déclencher une relecture
manuellement, depuis n'importe quel canal.

## Prérequis

- **Node.js ≥ 18**
- La **CLI Claude** installée et authentifiée sur la machine hôte
  (`npm install -g @anthropic-ai/claude-code`, puis `claude` une fois pour
  s'authentifier, ou définir `ANTHROPIC_API_KEY`).
- Une **application Discord** avec un bot. L'intent privilégié **MESSAGE
  CONTENT** doit être activé dans le portail développeur Discord (nécessaire
  pour lire les liens de PR dans les messages).

## Installation

```bash
npm install
cp .env.example .env   # puis renseignez les variables
```

## Configuration (`.env`)

| Variable                   | Obligatoire | Description                                                        |
| -------------------------- | ----------- | ------------------------------------------------------------------ |
| `DISCORD_TOKEN`            | ✅          | Token du bot Discord.                                              |
| `DISCORD_CLIENT_ID`        | ✅          | Client ID de l'application Discord.                               |
| `PR_REVIEW_CHANNEL_ID`     | –           | ID(s) des canaux surveillés (séparés par des virgules).           |
| `GITHUB_TOKEN`             | –           | Token GitHub (dépôts privés / limites de débit).                  |
| `GITHUB_API_URL`           | –           | Base de l'API GitHub (GitHub Enterprise). Défaut : api.github.com. |
| `PR_REVIEW_MAX_DIFF_CHARS` | –           | Taille max du diff envoyé à l'agent. Défaut : 200000.             |
| `CLAUDE_CLI_PATH`          | –           | Commande de la CLI Claude. Défaut : `claude`.                     |
| `CLAUDE_CLI_MODEL`         | –           | Modèle Claude (optionnel).                                        |
| `CLAUDE_CLI_EXTRA_ARGS`    | –           | Arguments CLI supplémentaires (séparés par des espaces).          |
| `CLAUDE_REVIEW_TIMEOUT_MS` | –           | Délai max d'une relecture (ms). Défaut : 300000.                  |
| `SENTRY_DSN`               | –           | Active Sentry si défini.                                          |

> Pour obtenir l'ID d'un canal : activez le **Mode développeur** dans Discord
> (Paramètres → Avancés), puis clic droit sur le canal → « Copier l'identifiant ».

## Utilisation

```bash
# Développement (rechargement à chaud)
npm run dev

# Déployer les commandes slash (/ping, /review)
npm run deploy:commands

# Production
npm run build
npm start
```

### Docker

```bash
docker compose up --build
```

L'image installe la CLI Claude. Fournissez son authentification via
`ANTHROPIC_API_KEY` (ou en montant `~/.claude`) — voir `docker-compose.yml`.

## Architecture

```
src/
├── app.ts                  # Point d'entrée : chargement dynamique des modules
├── deploy-commands.ts      # Enregistrement des commandes slash
├── commands/
│   ├── ping.ts
│   └── review.ts           # /review : relecture manuelle d'une PR
├── events/
│   ├── ready.ts
│   ├── interactionCreate.ts
│   └── messageCreate.ts    # Détection des liens de PR dans les canaux surveillés
├── services/
│   ├── github.ts           # Parsing d'URL + récupération métadonnées & diff
│   ├── claudeReview.ts     # Prompt optimisé + invocation de la CLI Claude
│   └── reviewService.ts    # Orchestration de bout en bout
├── interactions/           # Routage des composants (boutons, modals…)
├── types/
└── utils/                  # Logger, config, erreurs, embeds, sanitisation…
```

## Qualité & Intégration continue

Le pipeline GitHub Actions (`.github/workflows/ci.yml`) s'exécute à chaque push
et pull request :

- **Prettier** — vérification du formatage (`npm run format:check`)
- **ESLint** — analyse statique (`npm run lint`)
- **TypeScript** — vérification des types (`npm run type-check`)
- **Vitest** — tests unitaires + couverture (`npm run test:coverage`)
- **Build** — compilation `tsc` + résolution des alias (`npm run build`)
- **Matrice** — Node.js 20.x et 22.x
- **Audit** — `npm audit` (bloquant sur les vulnérabilités _critical_ en production)
- **Docker** — build de l'image (validation du `Dockerfile`)

En complément : **CodeQL** (`.github/workflows/codeql.yml`) pour l'analyse de
sécurité, et **Dependabot** (`.github/dependabot.yml`) pour la mise à jour des
dépendances npm, des actions GitHub et de l'image Docker.

Pour tout lancer localement en une commande :

```bash
npm run validate   # format:check + lint + type-check + test + build
```

## Sécurité

- Les tokens (Discord, GitHub) et URLs de connexion sont masqués dans les logs
  et les rapports Sentry (`utils/sanitize.ts`).
- L'agent de relecture ne reçoit que les métadonnées et le diff de la PR :
  aucune session ni contexte n'est partagé entre les relectures.

## Licence

MIT
