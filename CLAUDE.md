# CLAUDE.md

Guide destiné à Claude Code (et aux développeurs) pour travailler efficacement
dans ce dépôt. À lire avant toute modification.

## 1. Vue d'ensemble

**Pivot Discord Bot** est un bot Discord (TypeScript + discord.js v14) qui
orchestre la **CLI Claude installée sur la machine hôte** pour rendre deux
services :

1. **Relecture de Pull Requests GitHub** (`/review` + surveillance de canaux) —
   un agent Claude relit le diff d'une PR puis **agit directement dessus via la
   CLI `gh`** : approbation si la PR est correcte, demande de changements avec
   les correctifs proposés sinon.
2. **Recherche métier `/ask`** — Claude Code explore un **checkout local du code
   Pivot** (branche `main`) en **lecture seule** et répond à une question
   **fonctionnelle** (non technique), avec des garde-fous anti-hallucination.

Le bot n'appelle jamais l'API Anthropic directement : il **délègue à la CLI
Claude** via `child_process` (voir `src/services/claudeCli.ts`).

## 2. Commandes de développement

| Commande                  | Rôle                                                       |
| ------------------------- | ---------------------------------------------------------- |
| `npm run dev`             | Lance le bot en watch (tsx).                               |
| `npm run build`           | Compile (`tsc`) **puis** résout les alias (`tsc-alias`).   |
| `npm start`               | Exécute `dist/app.js` (production).                        |
| `npm run deploy:commands` | Enregistre les commandes slash auprès de Discord.          |
| `npm run type-check`      | Vérifie les types sans émettre.                            |
| `npm run lint`            | ESLint (flat config).                                      |
| `npm run format`          | Prettier (écriture).                                       |
| `npm test`                | Tests Vitest (`vitest run`).                               |
| `npm run test:coverage`   | Tests + couverture v8.                                     |
| `npm run validate`        | **format:check + lint + type-check + test + build** (CI).  |

> Avant de committer une modification non triviale, lance **`npm run validate`**.

## 3. Architecture

```
src/
├── app.ts                 # Entrée : chargement dynamique commands/events/components/crons
├── deploy-commands.ts     # Enregistrement des slash commands
├── commands/              # 1 fichier = 1 slash command (export default { data, execute })
│   ├── ping.ts
│   ├── review.ts          # /review url:<pr>
│   └── ask.ts             # /ask question:<...>
├── events/                # export default { name, once, execute }
│   ├── ready.ts
│   ├── interactionCreate.ts
│   └── messageCreate.ts   # Détecte les liens de PR dans les canaux surveillés
├── services/              # Logique métier (sans dépendance Discord si possible)
│   ├── claudeCli.ts       # Runner bas niveau de la CLI Claude (spawn + stdin/stdout)
│   ├── github.ts          # Parsing d'URL + métadonnées de PR via l'API GitHub
│   ├── claudeReview.ts    # Prompt de relecture + runClaudeReview
│   ├── reviewWorkspace.ts # Checkout local du code des PR (clone + gh pr checkout)
│   ├── reviewService.ts   # Orchestration de la relecture de PR
│   └── askService.ts      # Prompt métier + garde-fous + orchestration /ask
├── interactions/          # Routage des composants (boutons, modals, selects)
├── types/bot.ts           # Types partagés (BotCommand, ExtendedClient, ...)
└── utils/                 # Logger, config, erreurs, embeds, sanitize, sentry, découpage
```

Le chargement est **conventionnel** : déposer un fichier dans `commands/` ou
`events/` suffit, `app.ts` le charge automatiquement au démarrage.

## 4. Conventions & contraintes importantes

- **Alias de chemins** : les imports utilisent `@/...` (ex. `@/utils`,
  `@/services/github`). En dev, `tsx` les résout ; **en production, `tsc` seul
  ne réécrit PAS les alias** — c'est pourquoi le build est `tsc && tsc-alias`.
  Tout nouvel alias doit être ajouté dans `tsconfig.json` **et**
  `vitest.config.ts`.
- **TypeScript très strict** : `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`. Conséquences :
  - accéder à l'environnement via `process.env['MA_VAR']` (crochets, pas point) ;
  - un accès indexé (`arr[0]`, `match[1]`) est `T | undefined` : garder les
    gardes (`if (!x) ...`, `?? fallback`) ;
  - pour une propriété optionnelle pouvant valoir `undefined`, typer
    `champ?: string | undefined`.
- **Logs** : toujours passer par `Logger` (`@/utils`), qui émet du JSON
  structuré. Ne pas utiliser `console.log` dans le code applicatif.
- **Erreurs** : lever les classes de `@/utils/errors` (`ValidationError`,
  `ConfigurationError`, `ExternalServiceError`, ...) et laisser
  `ErrorHandler`/`handleInteractionError` gérer la réponse utilisateur.
- **Secrets** : `utils/sanitize.ts` masque tokens et URLs de connexion dans les
  logs et Sentry. Ne jamais logguer de secret en clair.
- **Discord** : respecter la limite de 2000 caractères par message via
  `splitForDiscord` (`@/utils`).

## 5. Intégration de la CLI Claude

Toute invocation passe par `runClaudeCli({ prompt, cliPath, args, timeoutMs, cwd })` :

- Le **prompt est transmis via stdin** (pas d'argument) pour éviter les limites
  de longueur.
- **`/review`** : `claude -p --output-format text --allowedTools "Bash(gh pr:*)"
  "Bash(gh api:*)" Read Grep Glob --max-turns N` avec **`cwd` = checkout local de
  la PR** préparé par `reviewWorkspace.ts` (clone persistant par dépôt dans
  `PR_REVIEW_WORKSPACE_DIR` + `gh pr checkout`, relectures d'un même dépôt
  sérialisées par un verrou). Le prompt est **minimal** (dépôt, numéro, URL +
  mission) : l'agent récupère lui-même la description (`gh pr view`) et le diff
  (`gh pr diff`), explore le code local en lecture seule, puis **approuve la PR
  ou demande des changements** directement sur GitHub. Si la préparation du
  checkout échoue, la relecture se replie sur la CLI `gh` seule (sans `cwd`).
  `gh` s'authentifie via `GITHUB_TOKEN` (hérité de l'environnement du bot), qui
  doit donc permettre le clone des dépôts et l'écriture sur les PR.
- **`/ask`** : `claude -p --output-format text --allowedTools Read Grep Glob
  --max-turns N` avec **`cwd` = checkout du code Pivot**. La liste blanche
  d'outils est le **garde-fou principal en lecture seule** : sans `Write`,
  `Edit` ni `Bash`, l'agent ne peut ni modifier le code ni exécuter de commande.

## 6. Garde-fous de `/ask` (recherche métier)

Objectif : des réponses **fonctionnelles/métier**, jamais techniques, et jamais
inventées. Trois couches de défense (voir `src/services/askService.ts`) :

1. **Prompt** (`buildAskPrompt`) : rôle d'analyste fonctionnel, audience non
   technique, interdiction du jargon/code, obligation de répondre uniquement à
   partir du code lu, et phrase de repli imposée `NOT_FOUND_SENTINEL` si
   l'information est absente. La question est isolée entre délimiteurs `"""`
   pour limiter l'injection de prompt.
2. **Outillage en lecture seule** : `--allowedTools` limité à `Read,Grep,Glob`
   (configurable via `ASK_ALLOWED_TOOLS`).
3. **Post-traitement** (`enforceBusinessRegister`) : retire tout bloc de code
   résiduel de la réponse avant publication.

Si tu modifies `/ask`, **conserver ces trois couches** et mettre à jour
`tests/askService.test.ts`.

## 7. Configuration (variables d'environnement)

Voir `.env.example` pour la liste complète et commentée. Repères :

- **Obligatoire** : `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`.
- **Relecture** : `PR_REVIEW_CHANNEL_ID` (canaux surveillés), `GITHUB_TOKEN`
  — ou une **GitHub App** via `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID` et
  `GITHUB_APP_PRIVATE_KEY_PATH` (les trois ensemble) : les reviews sont alors
  publiées au nom de l'App (`...[bot]`), tokens d'installation frappés par
  `src/services/githubApp.ts` —,
  `CLAUDE_CLI_PATH`, `CLAUDE_CLI_MODEL`, `CLAUDE_REVIEW_TIMEOUT_MS`,
  `PR_REVIEW_WORKSPACE_DIR` (checkout local ; vide = désactivé),
  `PR_REVIEW_ALLOWED_TOOLS`, `PR_REVIEW_MAX_TURNS`.
- **/ask** : `ASK_REPO_PATH` (active la commande), `ASK_ALLOWED_TOOLS`,
  `ASK_MAX_TURNS`, `ASK_TIMEOUT_MS`, `ASK_MAX_QUESTION_LENGTH`,
  `ASK_CLAUDE_MODEL`.
- **Observabilité** : `SENTRY_DSN` (optionnel).

La config est centralisée dans `utils/config.ts`, `utils/reviewConfig.ts` et
`utils/askConfig.ts`. **Ne pas lire `process.env` directement dans les
services** : ajouter le paramètre au module de config approprié.

## 8. Tests & CI

- Tests unitaires sur la **logique pure** (parsing, découpage, construction de
  prompt, garde-fous). Éviter d'appeler la vraie CLI Claude ou l'API GitHub dans
  les tests.
- La CI (`.github/workflows/ci.yml`) exécute `validate` sur Node 20 et 22, un
  audit de sécurité (bloquant sur `critical` en production) et un build Docker.
  **CodeQL** et **Dependabot** complètent le dispositif.
- Toute nouvelle fonctionnalité doit rester **verte** sous `npm run validate`.

## 9. Pièges connus

- **Intent privilégié** : la surveillance des messages exige `MESSAGE CONTENT`
  activé dans le portail développeur Discord.
- **CLI Claude requise** : `/review` et `/ask` échouent proprement
  (`ExternalServiceError`) si la CLI est absente/non authentifiée.
- **Récursion des fils** : les relectures sont publiées dans un thread (autre
  `channelId`) et les messages du bot sont ignorés → pas de boucle.
- **Roadmap** : voir `BACKLOG.md` pour l'état des lots et les évolutions prévues.
