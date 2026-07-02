# Pivot Discord Bot

[![CI](https://github.com/tellebma/pivot-discord-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/tellebma/pivot-discord-bot/actions/workflows/ci.yml)
[![CodeQL](https://github.com/tellebma/pivot-discord-bot/actions/workflows/codeql.yml/badge.svg)](https://github.com/tellebma/pivot-discord-bot/actions/workflows/codeql.yml)

Bot Discord de **relecture automatisée de Pull Requests GitHub**.

Le bot surveille un (ou plusieurs) canal(aux) Discord configurable(s). Dès qu'un
lien vers une Pull Request GitHub y est posté, il lance une **relecture par un
agent Claude**, en passant par la **CLI Claude installée sur la machine hôte**.
L'agent **approuve la PR** si elle peut l'être, ou **demande des changements
directement dessus** via la CLI `gh`. Un résumé est publié dans un fil de
discussion attaché au message d'origine.

Construit sur [`template_discord_bot_ts`](https://github.com/tellebma/template_discord_bot_ts)
(TypeScript + discord.js v14) : architecture modulaire (commandes, événements,
composants, crons chargés dynamiquement), logs JSON structurés, gestion d'erreurs
centralisée et intégration Sentry optionnelle.

## Fonctionnement

1. Un utilisateur poste une URL de PR (`https://github.com/owner/repo/pull/123`)
   dans un canal surveillé.
2. Le bot réagit avec 👀, vérifie la PR via l'API REST GitHub, puis prépare un
   **checkout local du code de la PR** (clone persistant par dépôt +
   `gh pr checkout`).
3. Il invoque la CLI Claude en mode headless (`claude -p`) avec un **prompt
   minimal** (dépôt, numéro, URL) : l'agent récupère lui-même la description et
   le diff via la CLI **`gh`**, explore le code local **en lecture seule**
   (Read/Grep/Glob), puis **approuve la PR** ou **demande des changements**
   (avec les correctifs proposés) directement sur GitHub. Si le checkout local
   n'a pas pu être préparé, la relecture se replie sur la CLI `gh` seule.
4. Le résumé de la relecture est publié dans un fil de discussion, et le message
   est marqué ✅ (ou ❌ en cas d'échec).

La commande **`/review url:<lien_PR>`** permet aussi de déclencher une relecture
manuellement, depuis n'importe quel canal.

### Recherche métier : `/ask`

La commande **`/ask question:<...>`** répond à une question **fonctionnelle**
(« métier ») sur le produit **Pivot**. Le bot fait explorer un **checkout local
du code Pivot** (branche `main`) par **Claude Code en lecture seule**, puis
renvoie une réponse volontairement **non technique**.

**Garde-fous** (pour éviter les réponses inventées ou trop techniques) :

1. **Prompt strict** — rôle d'analyste fonctionnel, audience non technique,
   interdiction du jargon et des extraits de code, obligation de répondre
   uniquement à partir du code réellement consulté, et phrase de repli imposée
   si l'information est absente (pas d'invention). La question est isolée pour
   limiter l'injection de prompt.
2. **Lecture seule** — outils limités à la recherche/lecture (`Read,Grep,Glob`) :
   l'agent ne peut ni modifier le code ni exécuter de commande.
3. **Post-traitement** — tout bloc de code résiduel est retiré de la réponse.

`/ask` n'est active que si `ASK_REPO_PATH` pointe vers un checkout local du code
Pivot.

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
| `GITHUB_TOKEN`             | –           | Token GitHub (lecture des PR + approbation/commentaires via `gh`). |
| `GITHUB_API_URL`           | –           | Base de l'API GitHub (GitHub Enterprise). Défaut : api.github.com. |
| `PR_REVIEW_WORKSPACE_DIR`  | –           | Clones locaux du code des PR relues. Défaut : `.review-workspace` ; vide = désactivé (relecture via `gh` seule). |
| `PR_REVIEW_ALLOWED_TOOLS`  | –           | Outils de l'agent de relecture. Défaut : `Bash(gh pr:*),Bash(gh api:*),Read,Grep,Glob`. |
| `PR_REVIEW_MAX_TURNS`      | –           | Tours max de l'agent de relecture. Défaut : 20.                   |
| `CLAUDE_CLI_PATH`          | –           | Commande de la CLI Claude. Défaut : `claude`.                     |
| `CLAUDE_CLI_MODEL`         | –           | Modèle Claude (optionnel).                                        |
| `CLAUDE_CLI_EXTRA_ARGS`    | –           | Arguments CLI supplémentaires (séparés par des espaces).          |
| `CLAUDE_REVIEW_TIMEOUT_MS` | –           | Délai max d'une relecture (ms). Défaut : 300000.                  |
| `ASK_REPO_PATH`            | –           | Checkout local du code Pivot. Active `/ask` si défini.            |
| `ASK_ALLOWED_TOOLS`        | –           | Outils Claude autorisés (lecture seule). Défaut : `Read,Grep,Glob`. |
| `ASK_MAX_TURNS`            | –           | Tours d'exploration max pour `/ask`. Défaut : 30.                 |
| `ASK_TIMEOUT_MS`           | –           | Délai max d'une recherche `/ask` (ms). Défaut : 300000.          |
| `ASK_MAX_QUESTION_LENGTH`  | –           | Longueur max d'une question. Défaut : 500.                        |
| `ASK_CLAUDE_MODEL`         | –           | Modèle Claude pour `/ask` (optionnel).                           |
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

### Docker (déploiement recommandé — « Option A »)

Conteneur autonome : la CLI Claude Code est **embarquée dans l'image**, le code
Pivot est monté **en lecture seule** pour `/ask`, et l'authentification Claude est
fournie au runtime (clé API ou montage `~/.claude`).

```bash
cp .env.example .env      # renseigner DISCORD_*, PIVOT_SRC_PATH, ANTHROPIC_API_KEY…
docker compose build
docker compose up -d
```

📖 Guide complet, variantes d'authentification, permissions/UID et dépannage :
**[`DEPLOYMENT.md`](./DEPLOYMENT.md)**.

## Architecture

```
src/
├── app.ts                  # Point d'entrée : chargement dynamique des modules
├── deploy-commands.ts      # Enregistrement des commandes slash
├── commands/
│   ├── ping.ts
│   ├── review.ts           # /review : relecture manuelle d'une PR
│   └── ask.ts              # /ask : recherche métier sur le code Pivot
├── events/
│   ├── ready.ts
│   ├── interactionCreate.ts
│   └── messageCreate.ts    # Détection des liens de PR dans les canaux surveillés
├── services/
│   ├── claudeCli.ts        # Runner bas niveau de la CLI Claude (partagé)
│   ├── github.ts           # Parsing d'URL + récupération métadonnées & diff
│   ├── claudeReview.ts     # Prompt optimisé + invocation de la CLI Claude
│   ├── reviewService.ts    # Orchestration de la relecture de PR
│   └── askService.ts       # Prompt métier + garde-fous + orchestration /ask
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
