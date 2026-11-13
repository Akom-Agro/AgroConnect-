# Revue des 5 principales failles — état au 12/11/2026 (à faire relire par un tiers)

| # | Faille / risque | Gravité | Constat | Action |
|---|---|---|---|---|
| 1 | Fonction sim_confirm_payment : un utilisateur peut se passer PRO sans payer tant que le mode simulation est actif | Haute | Contrôlée par payment_gateway_config.sim_enabled (modifiable par le super admin seulement). Génère aussi des commissions de parrainage factices | Mettre sim_enabled = false avant tout lancement public |
| 2 | create-worker crée des comptes avec la clé de service | Moyenne | Vérifie le JWT, puis que l'appelant est propriétaire de la ferme ou admin ; entrées validées. Pas de limitation de débit | Ajouter une limite par exploitant ; relire le contrôle d'autorisation |
| 3 | Cultures et produits ajoutés par les producteurs, visibles par tous et non modérés | Moyenne | Insertion autorisée à tout utilisateur connecté (is_custom, created_by) ; risque de contenu abusif ou de faux produits | Modération par l'admin ou le comité ; mention affichée |
| 4 | Données agronomiques et légales non vérifiées (matières actives, délais avant récolte, cycles des cultures) | Haute (métier) | Statut « non_verifie », délais vides, cycle_verified = false ; seuls Carbofuran et Diméthoate sont interdits avec source | Validation par le comité avant lancement ; avertissements affichés |
| 5 | Échanges de la coopérative non modérés ; conseils non validés | Moyenne | Aucun filtre ni signalement ; mention « non modérés » affichée | Modération et signalement ; notifications |

## Vérifié ce jour
- Acheteur de démo (RLS simulée en base) : voit sa propre ferme et son propre champ, aucun tracé d'autrui, 0 tâche.
- Le lot 9 n'est pas en ligne : fichiers dans le dossier « src. » au lieu de « src/ ».

## Non vérifié (à faire par un tiers)
- Règles RLS de tasks, fields, crops, work_types, phyto_products, payment_intents avec deux producteurs distincts.
- Tests d'interface en production (aucune capture réalisée ici).
