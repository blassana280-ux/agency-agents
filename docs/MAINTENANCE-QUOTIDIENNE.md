# 🛡️ Maintenance quotidienne des agents

Système autonome qui **renforce**, **protège** et **sécurise** le roster d'agents **chaque jour**, sans dépendre d'un agent ou d'un service externe. Il vit entièrement dans ce dépôt.

## Déclenchement

- **Automatique** : tous les jours à **06:30 (heure de Bamako)** via GitHub Actions (cron `30 6 * * *`).
- **Manuel** : onglet *Actions* → « 🛡️ Maintenance quotidienne des agents » → *Run workflow*.

## Les 3 volets

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

### 2. Renforcement — correctifs automatiques
Le script applique chaque jour, sans intervention humaine, les correctifs sûrs :
- suppression du BOM UTF-8 ;
- normalisation CRLF → LF ;
- suppression des espaces en fin de ligne ;
- ajout du newline final manquant.

Il enchaîne ensuite les vérifications structurelles existantes du dépôt :
`lint-agents.sh`, `check-divisions.sh`, `check-runbooks.sh`, `check-tools.sh`,
`check-agent-originality.sh` (anti-doublons par similarité de contenu).

Tout est commité automatiquement avec le préfixe `🛡️ maintenance quotidienne`.

### 3. Protection — traçabilité et issue de suivi
- **Rapport quotidien** : `docs/reports/maintenance/<date>.md` (+ copie `LATEST.md`) — historique complet, score par division, liste des anomalies.
- **Issue de suivi** : si une anomalie est détectée, une issue labellisée `maintenance-quotidienne` est ouverte (ou mise à jour avec le rapport du jour). Elle est **clôturée automatiquement** dès qu'un audit repasse sans erreur.

## Composants

```
.github/workflows/daily-maintenance.yml   ← orchestrateur quotidien (GitHub Actions)
scripts/agent-health.mjs                  ← audit anti-erreur + correctifs + rapport (Node ≥ 18, zéro dépendance)
docs/reports/maintenance/                ← rapports quotidiens versionnés
docs/MAINTENANCE-QUOTIDIENNE.md          ← cette documentation
```

## Utilisation manuelle

```bash
# Audit seul (lecture seule)
node scripts/agent-health.mjs

# Audit + correctifs automatiques + rapport
node scripts/agent-health.mjs --fix --report
```

Codes de sortie : `0` = sain, `1` = erreurs détectées, `2` = problème d'environnement.

## Étendre le système

- Ajouter une vérification : compléter `auditAgent()` dans `scripts/agent-health.mjs` (une ligne = un check).
- Ajouter un correctif automatique : compléter `fixText()` (uniquement des correctifs sûrs et réversibles).
- Déployer sur un autre fork : copier le workflow et le script, puis adapter `divisions.json`.
