# Diagnostics CI

Rapports generes par le workflow `Repair CI consistency` (.github/workflows/repair-ci.yml).

- Chaque execution cree un rapport date `YYYY-MM-DD.md` avec l'etat avant/apres reparation.
- Le 7 oct. 2026 : enregistrement de la division `orchestration`, exclusion de `augmentations/` et `docs/` des divisions, regeneration de `integrations/` et du manifeste `convert-outputs.sha256`.
- Les issues sont desactivees sur ce depot : ces rapports servent de journal des interventions CI.
