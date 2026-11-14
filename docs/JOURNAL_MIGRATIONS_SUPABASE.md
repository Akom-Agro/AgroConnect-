# Journal des migrations appliquées sur Supabase (relevé le 14/11/2026)

Source : liste des migrations du projet `iexwjycgqmwodmuxfjqd`. Ce fichier ne contient que les NOMS et dates ; le texte SQL des migrations des lots 15 à 19 n'est pas encore exporté dans le dépôt (voir lot V4-0, point B : export à compléter).

Les migrations des 11 et 12 novembre (catalogue engrais, démonstration, fiche produit) existent déjà en SQL dans `docs/`.

| Version | Nom |
|---|---|
| 20260918 à 20260919 | schéma initial (plusieurs reprises : reset_old_schema, tables, sécurité RLS) |
| 20260919082938 | harden_function_execute_grants |
| 20260919083014 | add_fk_indexes |
| 20260928094813 | grant_base_table_privileges |
| 20260928203430 | lot1_worker_invites_and_role_flow |
| 20260928203443 | lot1_public_catalog_access |
| 20260929091003 | lot1_anon_execute_role_checks |
| 20260929200127 | lot2_monetization_and_pricing |
| 20260929200329 | lot2_3_seed_and_forecast_livestock |
| 20260929200340 | lot3_forecast_rls_herds |
| 20260930031652 | lot2_monetization_pro_and_commission |
| 20260930062525 | lot3_market_reference_price_and_listings |
| 20261001224033 | lot_monetisation_parrainage_et_paiement_securise |
| 20261001224317 | fix_referrals_fk_to_profiles |
| 20261001224338 | fix_referral_trigger_order |
| 20261002040642 | ai_diagnoses_table |
| 20261005233238 | admin_create_producer_and_pro_grants_audit |
| 20261006195256 | market_moderation_workflow |
| 20261006195402 | fix_market_listings_admin_moderation_rls |
| 20261006195446 | fix_market_history_stale_note |
| 20261007012232 | input_products_add_description |
| 20261007012345 | fields_add_boundary_polygon |
| 20261007071719 | ai_diagnoses_structured_treatment |
| 20261014064428 | ma_ferme_a_gouvernance_regles_journal |
| 20261014111848 | treatments_type_elargi |
| 20261014121757 | agro_rules_types_pied_foliaire |
| 20261031165510 | securite_durcissement_fonctions |
| 20261101010747 | photos_offres_marche |
| 20261107162256 | catalogue_engrais |
| 20261110031635 | demo_coop_historique |
| 20261110031651 | coop_offer_totals |
| 20261111232248 | fiche_produit_vitrine |
| 20261111232417 | vitrine_lecture_publique |
| 20261112094958 | travaux_produits_cultures_taches_rls |
| 20261112095235 | passerelle_paiement_simulation |
| 20261112212224 | categories_produits_engrais_foliaire |
| 20261113093304 | mes_produits_materiel_par_exploitation |
| 20261113223329 | lot15_validation_taches_avis |
| 20261114001733 | lot16_roles_creation_ferme_reservee |
| 20261114060621 | lot18_photos_diagnostic_visibles_exploitant |
| 20261114115801 | lot19_correctifs_audit |

## Constats V4-0 (14/11/2026)
- 61 tables, RLS active partout, 136 politiques.
- `sim_enabled = false`. `sim_confirm_payment`, `seed_demo_data`, `purge_demo_data`, `approve_due_referrals` : exécutables par les connectés seulement (pas par le public).
- `coop_offer_totals_public` : exécutable sans connexion, voulu (vitrine) ; ne renvoie que des totaux agrégés (kg engagés, nombre de producteurs) des offres ouvertes. DÉCISION promoteur : conservée.
- Bucket `product-labels` public en lecture, écriture réservée à l'admin (politiques RLS). DÉCISION promoteur : conservé.
- Points à traiter (lot V4-1/V4-2) : `admin-create-producer` génère le mot de passe avec Math.random (à remplacer par crypto.getRandomValues) et n'impose pas le changement à la première connexion ; `diagnose-image` n'a pas de quota ni de plafond de budget ; protection contre les mots de passe compromis désactivée (offre Pro).
