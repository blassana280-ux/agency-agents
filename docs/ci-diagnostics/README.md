# Diagnostics CI

Rapports generes par le workflow `Repair CI consistency` (.github/workflows/repair-ci.yml).

- Chaque execution cree un rapport date `YYYY-MM-DD.md` avec l'etat avant/apres reparation.
- Le 7 oct. 2026 : enregistrement de la division `orchestration`, exclusion de `augmentations/` et `docs/`, regeneration de `integrations/` et du manifeste, renommage de l'agent `OmniRoute Commander` (orchestration) en `OmniRoute OmniBrain Commander` pour eliminer la collision de slug `omniroute-commander`.
- Tous les checks locaux passent : check-divisions (19 divisions), check-tools (17 tools), check-hermes-plugin, test-convert-frontmatter, lint orchestration, aucun slug duplique.
- Les issues sont desactivees sur ce depot : ces rapports servent de journal des interventions CI.
