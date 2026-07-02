# Déploiement — Option A (conteneur autonome)

Le bot est packagé en **image Docker autonome** : la **CLI Claude Code est
embarquée dans l'image**, le **code Pivot** est monté en **lecture seule** pour
`/ask`, et l'**authentification Claude** est fournie au runtime.

C'est l'option recommandée pour la reproductibilité (mêmes artefacts d'un
environnement à l'autre, aucune dépendance à un binaire de l'hôte).

## 1. Prérequis

- Docker + Docker Compose sur l'hôte.
- Un **checkout du code Pivot** sur l'hôte (branche `main`), ex. `/srv/pivot-src`.
- Une **application Discord** (bot) avec l'intent privilégié **MESSAGE CONTENT**
  activé (nécessaire pour détecter les liens de PR dans les messages).
- Une **authentification Claude** : une clé API **ou** un abonnement Pro/Max.

## 2. Configuration

```bash
cp .env.example .env
```

Renseigner au minimum dans `.env` :

| Variable               | Rôle                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `DISCORD_TOKEN`        | Token du bot Discord.                                        |
| `DISCORD_CLIENT_ID`    | Client ID de l'application Discord.                          |
| `PR_REVIEW_CHANNEL_ID` | Canal(aux) surveillé(s) pour la relecture de PR.            |
| `PIVOT_SRC_PATH`       | Chemin **hôte** du code Pivot (monté sur `/pivot`).         |
| `ANTHROPIC_API_KEY`    | Clé API Claude (voir authentification ci-dessous).          |

> `ASK_REPO_PATH` est déjà fixé à `/pivot` par `docker-compose.yml` : ne pas le
> changer en Docker, utiliser `PIVOT_SRC_PATH` pour pointer le dossier hôte.

## 3. Authentification Claude — deux variantes

### 3a. Clé API (recommandé)

Le plus simple en serveur/headless : renseigner `ANTHROPIC_API_KEY` dans `.env`.
Elle est transmise au conteneur (`env_file`) puis héritée par le sous-processus
`claude`. Aucun montage nécessaire.

### 3b. Abonnement Claude (Pro/Max)

1. S'authentifier **une fois sur l'hôte** : `claude login` (crée `~/.claude`).
2. Dans `docker-compose.yml`, décommenter le montage :
   ```yaml
   - ${HOME}/.claude:/home/botuser/.claude
   ```
   Il est en **lecture/écriture** : la CLI doit pouvoir **rafraîchir ses jetons**.
3. **Permissions / UID** — le conteneur tourne en `botuser` (UID `1001`). Si le
   propriétaire hôte de `~/.claude` a un autre UID, alignez-le :
   - soit via `user: "<uid>:<gid>"` dans `docker-compose.yml` ;
   - soit en (re)construisant l'image avec le bon UID :
     `docker compose build --build-arg UID=$(id -u) --build-arg GID=$(id -g)`.

## 3 ter. GitHub App — reviews au nom d'un bot (optionnel, recommandé)

Par défaut, les reviews sont publiées au nom du compte propriétaire du
`GITHUB_TOKEN`. Avec une **GitHub App**, elles apparaissent au nom de l'App
avec le badge officiel « bot » (ex. `pivot-review-bot[bot]`), et l'App peut
approuver les PR de n'importe qui — y compris celles du propriétaire du token.

1. Créer l'App sur l'organisation (Settings → Developer settings → GitHub
   Apps) : webhook désactivé, permissions `Pull requests: Read and write` et
   `Contents: Read-only`, puis l'**installer** sur les dépôts à relire.
2. Récupérer : l'**App ID** (ou le Client ID `Iv...`), l'**Installation ID**
   (dans l'URL de la page Configure : `.../installations/<ID>`) et la **clé
   privée** (`.pem`, générée depuis la page de l'App — c'est le seul secret).
3. Monter le `.pem` en volume **lecture seule** (voir `docker-compose.unraid.yml`,
   volume 3) et renseigner dans `.env` :
   ```bash
   GITHUB_APP_ID=...
   GITHUB_APP_INSTALLATION_ID=...
   GITHUB_APP_PRIVATE_KEY_PATH=/home/botuser/github-app.pem
   ```

Le bot frappe lui-même les tokens d'installation (validité 1 h, cache
automatique). Si ces variables sont absentes, comportement inchangé :
`GITHUB_TOKEN` statique. Si un dépôt à relire n'est pas couvert par
l'installation de l'App, `gh` recevra un 404 : ajouter le dépôt dans
l'installation (page Configure de l'App).

## 4. Volume de code Pivot

- Monté **en lecture seule** (`:ro`) : le garde-fou d'outils (`Read,Grep,Glob`)
  empêche déjà toute écriture, le `:ro` est une seconde barrière.
- Le montage **ne se met pas à jour tout seul**. Garder `main` à jour via un cron
  hôte, par exemple :
  ```cron
  */15 * * * * cd /srv/pivot-src && git pull --ff-only >/dev/null 2>&1
  ```
- Le dossier doit être **lisible par l'UID du conteneur** (`1001` par défaut).

## 5. Démarrage

```bash
docker compose build
docker compose up -d
docker compose logs -f          # logs JSON structurés
```

Enregistrer les commandes slash (`/ping`, `/review`, `/ask`) une fois :

```bash
docker compose run --rm pivot-discord-bot node dist/deploy-commands.js
```

## 6. Mise à jour

```bash
git pull
docker compose build
docker compose up -d            # recrée le conteneur avec la nouvelle image
```

## 7. Vérifications rapides

- `docker compose logs` doit montrer `Bot is online and ready`.
- `/ping` répond → le bot est connecté à Discord.
- `/review url:<PR>` → la CLI Claude et l'accès réseau GitHub fonctionnent.
- `/ask question:<...>` → le volume `/pivot` et l'authentification Claude
  fonctionnent. Si `/ask` répond qu'elle n'est pas configurée, vérifier
  `PIVOT_SRC_PATH` et le montage.

## 8. Dépannage

| Symptôme                                             | Piste                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `Impossible de lancer la CLI Claude`                 | Image mal construite (CLI absente) ou `CLAUDE_CLI_PATH` erroné.  |
| La CLI démarre mais échoue à s'authentifier          | `ANTHROPIC_API_KEY` absente, ou `~/.claude` non lisible (UID).   |
| `/ask` : « non configurée »                          | `PIVOT_SRC_PATH` non défini / volume non monté.                  |
| `/ask` ne trouve rien alors que le code existe       | Permissions du volume (lisible par UID 1001 ?).                  |
| Les liens de PR ne déclenchent rien                  | Intent MESSAGE CONTENT désactivé, ou mauvais `PR_REVIEW_CHANNEL_ID`. |
