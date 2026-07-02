# Backlog — Pivot Discord Bot

Suivi des lots de travail. Convention d'état : ✅ Fait · 🚧 En cours · 📋 Planifié · 💡 Idée.

Priorité : **P1** (haute) · **P2** (moyenne) · **P3** (basse).

---

## ✅ Fait

### F1 — Socle du bot (à partir du template)

- Base TypeScript + discord.js v14, chargement dynamique
  (commandes/événements/composants/crons).
- Logs JSON structurés, gestion d'erreurs centralisée, sanitisation des secrets,
  intégration Sentry optionnelle.
- Commande `/ping`.

### F2 — Relecture automatisée de Pull Requests GitHub

- Surveillance de canaux configurables (`PR_REVIEW_CHANNEL_ID`) : détection des
  liens de PR (multi-liens + déduplication).
- Récupération des métadonnées et du diff via l'API REST GitHub.
- Prompt de relecture optimisé exécuté par un agent Claude **sans contexte** via
  la CLI Claude (headless).
- Publication du résultat dans un fil de discussion, réactions de statut, et
  commande manuelle `/review url:<pr>`.

### F3 — Intégration continue « digne de ce nom »

- ESLint (flat config) + Prettier + Vitest, scripts `validate`.
- GitHub Actions : matrice Node 20/22 (format, lint, types, tests+couverture,
  build), audit sécurité (bloquant sur `critical` en prod), build Docker.
- CodeQL + Dependabot (npm, actions, docker).
- Tests unitaires de la logique pure.

### F4 — Documentation projet

- `CLAUDE.md` (guide de contribution/architecture) et ce `BACKLOG.md`.

### F5 — Recherche métier `/ask` (dernier lot ajouté)

- Commande `/ask question:<...>` : Claude Code explore un **checkout local du
  code Pivot** (branche `main`) en **lecture seule** et répond en registre
  **fonctionnel/métier**.
- **Garde-fous** : prompt strict (anti-hallucination, anti-jargon, question
  isolée contre l'injection), outillage limité à `Read/Grep/Glob`,
  post-traitement retirant tout bloc de code résiduel.
- Configuration dédiée (`ASK_*`), validation de la question, phrase de repli
  « information non trouvée », tests des garde-fous.

---

## 📋 Planifié

### P-01 · P1 · Fiabiliser `/ask`

- Jeu de questions de référence + évaluation de la qualité des réponses.
- Détection plus fine du registre technique (au-delà des blocs de code) et
  métrique de « taux de non-réponse » pour calibrer les garde-fous.
- Cache des réponses récentes (même question → éviter un appel CLI).

### P-02 · P1 · Robustesse de l'orchestration CLI

- File d'attente / limite de concurrence des invocations Claude (éviter la
  saturation de l'hôte si plusieurs PR/questions arrivent en rafale).
- Retour de progression (« relecture en cours… ») et bouton d'annulation.

### P-03 · P2 · Contrôle d'accès

- Restreindre `/review` et `/ask` à des rôles Discord configurables.
- Journalisation d'audit (qui a demandé quoi, quand).

### P-04 · P2 · Rendu des réponses

- Réponses en **embeds** structurés plutôt qu'en texte tronçonné.
- Bouton « relancer » / « approfondir » sur une relecture ou une réponse.

### P-05 · P2 · Qualité de la relecture

- Prise en compte des commentaires de PR existants et du fil de discussion.
- Option de relecture ciblée (fichiers/dossiers spécifiques).

---

## 💡 Idées (non priorisées)

- Poster la relecture **directement en commentaire de la PR GitHub** (en plus de
  Discord).
- Support GitLab / Bitbucket.
- Rapport hebdomadaire (cron) : synthèse des PR relues.
- Commande `/glossaire` : définitions métier extraites du code Pivot.
- Persistance (base de données) pour l'historique des relectures et des
  questions.

---

## 🚫 Hors périmètre (décisions)

### D-01 — Commande `/feedback` : NON retenue dans le bot

Le recueil de feedback utilisateur est **intégré directement dans l'application
Pivot**, pas dans le bot Discord.

_Raison_ : le feedback n'a de valeur qu'avec son contexte (écran concerné, état
de la session, parcours en cours, éventuelle capture). Le capturer dans l'app,
au moment vécu par l'utilisateur, évite la friction d'un aller-retour vers
Discord et préserve ce contexte. Le bot reste focalisé sur la relecture de PR et
la recherche métier.
