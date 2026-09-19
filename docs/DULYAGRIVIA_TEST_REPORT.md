# Rapport de test — DulyAgrivia 2.1

Conformément à la consigne reçue : **aucune ligne n'est marquée PASS si elle n'a pas été réellement exécutée et vérifiée.** Ce travail a été fait sans accès réseau ni projet Supabase réel — tout est donc NON TESTÉ à ce stade, à l'exception des vérifications statiques listées en bas de tableau.

| Élément | Résultat |
|---|---|
| Build (`npm install` / `npm run build`) | NON TESTÉ |
| Exécution `supabase_schema.sql` (1ère fois) | NON TESTÉ |
| Exécution `supabase_schema.sql` (2e fois, idempotence) | NON TESTÉ |
| RLS (isolation Producteur A / Producteur B) | NON TESTÉ |
| Tentative de création d'un compte role=admin | NON TESTÉ |
| Producteur | NON TESTÉ |
| Acheteur | NON TESTÉ |
| Ouvrier | NON TESTÉ |
| Admin | NON TESTÉ |
| Agriculture (champs, cultures, prévisions) | NON TESTÉ |
| Élevage (troupeaux, suivi sanitaire) | NON TESTÉ |
| Appel d'offres agriculture | NON TESTÉ |
| Appel d'offres élevage | NON TESTÉ |
| Réponse Producteur | NON TESTÉ |
| Acceptation / refus Acheteur | NON TESTÉ |
| Notifications | NON TESTÉ |
| Tâches Ouvrier | NON TESTÉ |
| Carte (GPS ponctuel) | NON TESTÉ |
| Financement | NON TESTÉ |
| Intrants | NON TESTÉ |
| Mobile | NON TESTÉ |
| Desktop | NON TESTÉ |
| Déploiement Netlify | NON TESTÉ |

## Vérifications statiques effectuées (relecture de code, pas exécution)
- Équilibrage des parenthèses/accolades/crochets de `src/main.tsx` : correct.
- Cohérence des noms de colonnes entre `main.tsx` et `supabase_schema.sql` (crop_id/livestock_type_id, field_id/herd_id) : relue et cohérente.
- Contrainte `responses_one_target_chk` : relue, exprime bien "champ OU troupeau, jamais les deux, jamais aucun".
- `handle_new_user()` : relue, rejette bien toute valeur de rôle hors producteur/acheteur/ouvrier.

Ces vérifications statiques ne remplacent pas une exécution réelle contre une base Supabase et un `npm run build` — elles réduisent seulement le risque d'erreur de syntaxe ou d'incohérence de nommage.

## À faire par vous avant toute mise en production
Exécuter la liste de tests ci-dessus dans un projet Supabase de test et cocher chaque ligne PASS/FAIL au fur et à mesure, en suivant `docs/PRODUCTION_CHECKLIST.md`.
