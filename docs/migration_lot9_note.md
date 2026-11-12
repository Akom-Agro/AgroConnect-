# Lot duly-9 — migrations appliquées sur Supabase (déjà exécutées)
- travaux_produits_cultures_taches_rls : policy tasks_insert_owner (admin OU propriétaire), crops (category, is_custom, created_by, cycle_verified + ~65 cultures), work_types, phyto_products, active_ingredients (non_verifie), colonnes work_type_id/product_id/recurrence_days sur tasks et treatments.
- passerelle_paiement_simulation : payment_gateway_config, RPC sim_confirm_payment.
- Edge Function create-worker (verify_jwt) déployée.
