# 🛡️ Maintenance quotidienne des agents

Système autonome qui **renforce**, **protège** et **sécurise** le roster d'agents **chaque jour**, sans dépendre d'un agent ou d'un service externe. Il vit entièrement dans ce dépôt.

## Déclenchement

- **Automatique** : tous les jours à **06:30 (heure de Bamako)** via GitHub Actions (cron `30 6 * * *`).
- **Manuel** : onglet *Actions* → « 🛡️ Maintenance quotidienne des agents » → *Run workflow*.

## Les 4 volets

### 1. Anti-erreur — `scripts/agent-health.mjs`
Audit complet de chaque agent `.md` des divisions (source de vérité : `divisions.json`) :

| Vérification | Gravité |
|---|---|
| Frontmatter manquant / non fermé / champs requis (`name`, `description`, `color`) | ❌ Erreur |
| Doublons de slug (nom de fichier) ou de `name` entre agents | ❌ Erreur |
| Liens internes cassés (fichiers référencés inexistants) | ❌ Erreur |
| Secrets exposés (clés `sk-…`, AWS `AKIA…`, tokens GitHub, clés privées) | ❌ Erreur |
| Bloc de code non fermé (``` orphelin), corps vide, division sans agent | ❌ Erreur |
| Couleur non hexadécimale (`#RRGGBB`) | ❌ Erreur |
| Description trop courte (< 40 car.), `emoji`/`vibe` absents, nommage non conventionnel, placeholders (TODO/FIXME), corps trop court, CRLF, BOM | ⚠️ Avertissement |

**Score de santé** par division et global : `100 − 5×erreurs − 1×avertissements` (moyenne pondérée par nombre d'agents).

### 2. Renforcement structurel — correctifs automatiques
Le script applique chaque jour, sans intervention humaine, les correctifs sûrs :
- suppression du BOM UTF-8 ;
- normalisation CRLF → LF ;
- suppression des espaces en fin de ligne ;
- ajout du newline final manquant.

Il enchaîne ensuite les vérifications structurelles existantes du dépôt :
`lint-agents.sh`, `check-divisions.sh`, `check-runbooks.sh`, `check-tools.sh`,
`check-agent-originality.sh` (anti-doublons par similarité de contenu).

Tout est commité automatiquement avec le préfixe `🛡️ maintenance quotidienne`.

### 2bis. Renforcement métier — chaque agent dans SA spécialité (`scripts/agent-reinforce.mjs`)
Chaque jour, l'IA renforce les agents les moins récemment renforcés (rotation complète du roster, `REINFORCE_PER_DAY` agents/jour, défaut 10) **dans leur spécialité propre** :
- jusqu'à 5 nouvelles capacités, techniques, modèles mentaux ou pratiques état de l'art 2026 **spécifiques à la spécialité de l'agent** ;
- un scénario avancé ajouté au workflow le plus pertinent (cas limite, mode de défaillance, procédure experte) ;
- frontmatter, identité, personnalité et contenu existant **préservés** ; journal des renforcements dans le « Daily Reinforcement Log » de chaque fichier.

Le résultat est proposé en **PR labellisée `renforcement-quotidien`** pour revue — jamais fusionné automatiquement sur `main`. Garde-fous : réponse rejetée si le frontmatter ou le nom change, si elle est trop courte (truncation), ou si elle ressemble à un secret.

**Prérequis (une seule fois)** : ajouter le secret `MISTRAL_API_KEY` dans *Settings → Secrets and variables → Actions → New repository secret* (clé depuis la console Mistral). Sans la clé, l'étape est simplement ignorée — le reste de la maintenance continue.

### 3. Protection — traçabilité et issue de suivi
- **Rapport quotidien** : `docs/reports/maintenance/<date>.md` (+ copie `LATEST.md`) — historique complet, score par division, liste des anomalies.
- **Rapport de renforcement** : `docs/reports/maintenance/REINFORCEMENT.md` + état de rotation `reinforcement-state.json`.
- **Issue de suivi** : si une anomalie est détectée, une issue labellisée `maintenance-quotidienne` est ouverte (ou mise à jour avec le rapport du jour). Elle est **clôturée automatiquement** dès qu'un audit repasse sans erreur.

## Composants

```
.github/workflows/daily-maintenance.yml   ← orchestrateur quotidien (GitHub Actions)
scripts/agent-health.mjs                  ← audit anti-erreur + correctifs + rapport (Node ≥ 18, zéro dépendance)
scripts/agent-reinforce.mjs               ← renforcement métier des spécialités par IA (API Mistral)
docs/reports/maintenance/                 ← rapports quotidiens versionnés + état de rotation
docs/MAINTENANCE-QUOTIDIENNE.md           ← cette documentation
```

## Utilisation manuelle

```bash
# Audit seul (lecture seule)
node scripts/agent-health.mjs

# Audit + correctifs automatiques + rapport
node scripts/agent-health.mjs --fix --report

# Renforcement métier (nécessite MISTRAL_API_KEY dans l'environnement)
MISTRAL_API_KEY=… node scripts/agent-reinforce.mjs
```

Codes de sortie : `0` = sain, `1` = erreurs détectées, `2` = problème d'environnement.

## Étendre le système

- Ajouter une vérification : compléter `auditAgent()` dans `scripts/agent-health.mjs` (une ligne = un check).
- Ajouter un correctif automatique : compléter `fixText()` (uniquement des correctifs sûrs et réversibles).
- Régler le rythme de renforcement : variable `REINFORCE_PER_DAY` dans le workflow (défaut 10 agents/jour ≈ rotation complète du roster en ~19 jours).
- Déployer sur un autre fork : copier le workflow et les deux scripts, puis adapter `divisions.json`.
