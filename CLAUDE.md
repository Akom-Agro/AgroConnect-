# CLAUDE.md — État de DulyAgrivia (mis à jour le 31/10/2026)

## Règles de travail permanentes (voulues par le promoteur)
- Rôle : ingénieur agronome expert + ingénieur DevSecOps / lead développeur.
- Code complet et exécutable, jamais partiel. Relecture syntaxe / variables / liens / cas limites avant livraison.
- Sécurité dès la conception : validation des entrées, XSS/CSRF/injection SQL, aucun secret dans le code (clés uniquement en secrets d'Edge Function ou variables Netlify).
- Pour chaque module : critères de test précis. Pour la mise en ligne : guide pas à pas (hébergeur, base, SSL).
- Avancer composant par composant : base de données, backend, frontend, sécurité. Revue des 5 principales failles avant la mise en ligne.
- Additif : on modifie la version existante, jamais de remplacement. Déploiement par lots complets. Honnêteté : ne jamais présenter comme fonctionnel ce qui n'est pas branché.
- Identité visuelle (en fin de projet) : SaaS épuré et minimaliste + tableau de bord Agri-Tech, avec une identité propre à Duly Agrivia.
- Environnement : promoteur sur téléphone Android ; fichiers livrés pour GitHub « Upload files » (pas de copier-coller de gros fichiers).

## Stack
React + Vite + TypeScript (`src/main.tsx`, `src/farmtools.tsx`, `src/agrocalc.ts`), Supabase (Postgres, RLS, Edge Functions), Netlify (déploiement auto depuis GitHub `main`, HTTPS automatique).

## Validée (en production, testée)
- Authentification, rôles (producteur, acheteur, ouvrier, admin/super_admin), invitation ouvrier par code
- Fermes, champs, prévisions de récolte, tracé de parcelle (Leaflet)
- Marché, appels d'offres, modération du marché, PRO / commission, parrainage, paiements (confirmation manuelle sécurisée)
- Annuaires Financement et Intrants, administration (création producteur/PRO, intrants, monétisation)

## En cours
- Ma ferme (outils du champ, calculateurs granulé/liquide, comité) : build Netlify vert le 31/10 ; page Ma ferme et menu Comité vus en ligne ; test des onglets du champ à confirmer par le promoteur
- Navigation mobile : barre du bas + menu « Plus » ; bouton Retour du téléphone géré (historique) ; retour au champ depuis le diagnostic (livré 1/11, à confirmer)
- Photos obligatoires des offres du marché (3 min, 6 max) : base appliquée et testée ; interface livrée, à confirmer
- Onglet Équipe dans le champ (inviter un ouvrier, assigner des tâches) : droits testés ; interface livrée, à confirmer
- Design Ma ferme / champ : formulaires, étape de culture avec progression, onglets défilants (livré, à confirmer)
- Badge « Powered by Netlify » : à désactiver dans Netlify (Project configuration > General > Powered by Netlify badge), non gérable par le code

## Sécurité base de données (31/10/2026, appliqué et vérifié)
- Fonctions-déclencheurs : exécution publique retirée ; search_path fixé sur les 3 fonctions de parrainage ; `approve_due_referrals` réservée aux connectés (et contrôle admin interne)
- Restent volontairement appelables : `is_admin`, `is_pro`, `is_super_admin`, `is_committee`, `is_farm_member`, `is_field_member` (nécessaires aux règles RLS ; ne renvoient qu'un vrai/faux sur l'appelant)

## À faire
- Désigner les membres du comité (Super Admin) et saisir/valider les vraies règles ; supprimer les données DÉMO ensuite
- Raccordement API Plantix : accès commercial à demander ; adaptateur côté Edge Function
- Clé Anthropic pour le diagnostic IA (fin de projet, secret Edge Function)
- Refonte visuelle (identité Duly Agrivia, imagerie agricole), menu mobile
- Passerelle de paiement réelle (webhook signé)
- Sécurité : activer la protection contre les mots de passe compromis (Supabase > Authentication > Providers > Email, réglage à faire par le promoteur), revue des 5 failles principales avant la mise en ligne
- Phase 3 : coûts/stock, élevage avancé, alertes, hors-ligne, notifications push

## Hébergement (mis à jour le 05/11/2026)
- Validée : site en ligne sur Cloudflare (Workers + static assets, gratuit), Worker `dulyagrivia`, branche main de GitHub (mise en ligne automatique à chaque modification), domaine https://agrivia.corsonservices.com avec HTTPS. wrangler.jsonc à la racine. Variables de build VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY définies dans Cloudflare.
- Netlify (dulyagrivia.netlify.app) : conservé en secours, crédits de l'équipe épuisés (équipe partagée avec Dorelle Stevia), plus de nouveaux déploiements.
- Vitrine Corson Services : page /corson du projet Vercel agent-ao-express (fichier web/app/corson/page.tsx) ; lien Agrivia mis à jour vers agrivia.corsonservices.com (validée).
- À faire : Supabase > Authentication > URL Configuration : Site URL = https://agrivia.corsonservices.com et Redirect URLs avec /** (à confirmer) ; supprimer l'ancien Worker `dulyahrovia` (nom erroné) ; changer les mots de passe provisoires des 2 comptes.


## État au 07/11/2026
- Hébergement : Supabase Auth URL configurées (Validée).
- Ma ferme tests 1–6 : OK. Tests 7 (Équipe), 8 (offres 3 photos), 9 (Comité) : À faire.
- Navigation conservée après actualisation + caméra/galerie + compression photo (main.tsx) : En cours (à confirmer après envoi).
- Catalogue engrais du commerce (table fertilizer_products + bucket product-labels, migration docs/migration_catalogue_engrais.sql, appliquée) : En cours. Analyses de départ NON vérifiées (à confirmer sur les sacs).
- Calculateur « Engrais du commerce » (sacs, passages, g/pied) + onglet admin « Engrais » (farmtools.tsx, agrocalc.ts) : En cours (à tester).
- À faire : SMTP Brevo, supprimer Worker dulyahrovia, changer mot de passe temporaire, fiches liquides/foliaires, clé Anthropic, refonte visuelle, revue top 5 vulnérabilités.


## État au 10/11/2026
- Validée : calculateur « Engrais du commerce » + catalogue engrais (testé en ligne par le promoteur).
- Démonstration (migration docs/migration_demo_coop_historique.sql, appliquée) : lignes marquées is_demo (appels d'offres, réponses, marché, ventes groupées, engagements, échanges, intrants, financements, diagnostics). Boutons « Charger / Supprimer la démonstration » dans Administration (fonctions seed_demo_data / purge_demo_data, réservées admin). À supprimer avant la mise en ligne publique.
- Appels d'offres : l'administrateur voit tous les appels et peut répondre avec ses propres champs ; le producteur voit « Mes propositions envoyées » (statut). En cours (à tester).
- Coopérative (nouvel écran, menu Plus / barre latérale) : ventes groupées (créer = producteur PRO ou admin, s'engager, progression, valider/annuler) + Échanges entre producteurs (questions, conseils, informations, réponses). En cours (à tester). Les échanges ne sont pas validés par le comité.
- Diagnostic IA : photo sauvegardée (bucket privé diagnostic-photos) + historique avec miniature, détails, téléchargement ; bouton « Enregistrer quand même la photo » quand l'analyse IA n'est pas disponible. En cours (à tester). L'analyse elle-même exige la clé Anthropic (À faire).
- À faire : notifications push pour les échanges, modération des échanges, SMTP Brevo, clé Anthropic, refonte visuelle, revue top 5 vulnérabilités.


## État au 12/11/2026
- Testés par le promoteur : Coopérative, appels d'offres, marché, intrants, financements (affichage OK).
- Diagnostic IA : bouton « Enregistrer la photo dans mon historique » visible dès qu'une photo est choisie ; archivage automatique si l'analyse échoue ; après analyse réussie la photo est rattachée automatiquement. En cours (à tester). Analyse réelle : clé Anthropic À faire.
- Fiche produit : marché (nom, description, unité cageot/carton/sac/fût/tonne…, quantité, poids unitaire, prix/kg et prix/unité), appels d'offres (caractéristiques, conditionnement), ventes groupées (description), intrants (prix, unité, photos). En cours (à tester).
- Vitrine publique (visiteurs non connectés) : Intrants (boutique), Marché, Appels d'offres, Ventes groupées, Financements, avec invitation à créer un compte pour agir. Contact des financements réservé aux inscrits. Aucun paiement/commande en ligne pour les intrants : À faire (passerelle de paiement).
- Équipe : tâche assignable à un ouvrier invité avant son inscription (transférée à l'inscription via handle_new_user). En cours (à tester avec une vraie inscription par code).
- Migrations appliquées : migration_demo_coop_historique.sql, migration_fiche_produit_vitrine.sql.

## État au 12/11/2026 (lot duly-9)
- Validée (testée en base) : correctif RLS création de tâche (admin + propriétaire).
- En cours de test utilisateur : catalogue de travaux (work_types, ~45 types), produits phyto (nom commercial → matière active, mode d'action), cultures étendues (~75, cycle_days à confirmer = cycle_verified false), cultures personnalisées par producteur, comptes ouvriers créés par l'exploitant (Edge Function create-worker), carte de champ (satellite, tracé, surface, GPS) sur la page Champ et sur la Carte (tous rôles), paiement SIMULÉ Orange Money/MTN (payment_gateway_config.sim_enabled, RPC sim_confirm_payment).
- À faire : vraie passerelle (comptes marchands + clés dans les secrets Supabase + webhook), commandes d'intrants, validation par le comité des matières actives (statut légal, délai avant récolte), valeurs de cycle des nouvelles cultures, désactiver le mode simulation avant le lancement public.

## Lot duly-10 (12/11/2026)
- CONSTAT : le lot 9 avait été envoyé dans un dossier « src. » (avec un point) : non déployé. À renvoyer dans src/ et supprimer « src. ».
- Ajouts : délai avant récolte « non renseigné », avertissement « statut non vérifié » renforcé, produit interdit non sélectionnable, « cycle indicatif, à confirmer » sur la fiche champ, mentions « non modéré » (coopérative, cultures et produits personnalisés).
- Revue : docs/REVUE_5_FAILLES_LOT10.md. Test acheteur (RLS) : ne voit que sa propre ferme.

## Lot duly-11 (12/11/2026 soir)
- CONSTAT : l'envoi du lot 10 est retombé dans « src. » (le point final du lien a été pris pour le dossier), puis « src. » supprimé : la production est revenue à l'ancien code (pré-lot 9). Tout renvoyer dans src/.
- Ajouts : tracé du champ DÈS la création (Nouveau champ > Tracer le champ sur la carte), catégorie de produit choisie explicitement (herbicide, fongicide, insecticide, acaricide, nématicide, engrais foliaire) avec liste filtrée et ajout de produit par catégorie.

## Lot duly-13 (13/11/2026)
- CAUSE « Carte indisponible » : le index.html DE LA RACINE du dépôt n'avait pas Leaflet (seul src/index.html l'avait). Corrigé : index.html racine + chargement de secours de Leaflet dans FieldMap.
- Ajouts : suppression d'un champ (page Champ) et d'une exploitation (Ma ferme) avec confirmation ; explication « exploitation = entreprise/site, champ = parcelle ».
- Rappel : « src. » et fichiers « (1) » = envois ratés ; supprimer les anciens téléchargements du téléphone avant de re-télécharger.

## Lot duly-14 (13/11/2026)
- Connexion OUVRIER : onglet « Ouvrier / employé » sur l'écran de connexion (téléphone ou e-mail + mot de passe temporaire donné par l'exploitant, créé dans Champ → Équipe).
- « Ma position » : suivi GPS en direct (point bleu + cercle de précision), bouton pour arrêter (carte générale et carte du champ).
- Produits & matériel : la plateforme n'impose AUCUN produit. Table farm_inputs (par exploitation). La plateforme ne fournit que des CATÉGORIES (herbicide, raticide, engin, outil manuel, EPI…) proposées selon le type de travail. L'exploitant saisit ses produits/matériel, les sélectionne avec dosage lors d'une tâche ou du journal ; l'ouvrier voit « À utiliser : … ».
- Limites : interdiction de matières actives = contrôle texte côté appli seulement ; GPS direct et tracé non testés avec le vrai Leaflet ; anciennes tables phyto_products/active_ingredients conservées mais non utilisées par l'interface.

## Lot duly-15 (13/11/2026)
- Identifiants ouvrier : après création, boutons WhatsApp / SMS / copier avec message prêt (PAS d'envoi automatique : un SMS automatique exige une passerelle SMS payante, non branchée).
- Mot de passe : l'ouvrier le change dans Profil ; l'employeur génère un nouveau mot de passe (Équipe → 🔑, Edge Function reset-worker-password, vérifie que l'ouvrier appartient à sa ferme). « Mot de passe oublié » par e-mail impossible pour les comptes téléphone.
- Aller au champ : remplace l'ancienne fausse carte « Localisation » ; itinéraire Google Maps / Waze / envoi de la position (utilise latitude/longitude du champ tracé).
- Tâches : l'ouvrier termine avec remarque, l'employeur VALIDE ; journal du champ filtrable par période / ouvrier / état. Colonnes tasks.completion_note, completed_by, validated_at, validated_by.
- Votre avis : écran pour tous (table app_feedback, RLS : chacun voit les siens, l'admin voit tout).
- À faire : volet social (fil d'échanges entre agriculteurs), puis élevage.

## Lot duly-16 (14/11/2026) — Rôles et interfaces séparées
| Rôle | Accès | Interdit |
|---|---|---|
| Ouvrier (créé par le producteur) | Accueil ouvrier (tâches), Diagnostic IA (rattaché à un champ, visible dans l'historique de l'employeur), Mes tâches (commencer/terminer avec remarque), Mes champs en lecture, journal de travaux du champ, Profil (changer mot de passe), Votre avis | Créer champ/ferme/troupeau, marché, appels d'offres, coopérative, intrants, équipe, produits, prévisions |
| Acheteur | Accueil acheteur, Marché, Appels d'offres (les siens), Intrants, Profil, Votre avis | Ferme, élevage, carte, coopérative, équipe |
| Producteur | Tout son espace : fermes, champs, élevage, équipe, produits/matériel, coopérative, marché (vente = PRO), PRO | Administration |
| Admin / super admin | Tout + administration | — |
- Garde-fou côté serveur : seul un producteur/admin peut créer une exploitation (policy farms_insert_owner). Champs/troupeaux/tâches/produits : propriétaire de la ferme uniquement (RLS déjà en place).
- Garde-fou côté appli : un écran non autorisé pour le rôle retombe sur l'Accueil.
- Limites : ouvrier = secteur agriculture seulement (pas d'élevage pour l'instant) ; 1 compte acheteur existant possède une ferme créée avant la règle (conservée).
- À faire : « utilisateur » = producteur (abonnement PRO pour vendre) ; niveaux/abonnements à détailler dans le cahier des charges v3.

## Lot duly-17 (14/11/2026)
- Code d'invitation ouvrier : lien « J'ai reçu un code d'invitation » visible dans les onglets « Ouvrier / employé » ET « Créer un compte » (l'ouvrier saisit code + nom + e-mail + mot de passe). Recommandé : l'employeur crée le compte (téléphone) depuis Équipe.
- Comité technique → onglet Membres (admin) : créer un membre (nom + e-mail + mot de passe provisoire affiché une fois), nouveau mot de passe, retirer ; limite serveur 15, recommandé 10-15 (Edge Function committee-members, admin uniquement). Retirer ne supprime pas le compte.
- Mot de passe : bouton œil (afficher/masquer) sur tous les champs mot de passe.
- Communauté : nouvel onglet visible (producteurs/admin) : questions, problèmes rencontrés, expériences, conseils, informations + réponses. Non modéré (avertissement affiché). Lecture seule pour les non-producteurs.
- Rappel : le lot 16 (rôles) doit être en ligne pour que l'ouvrier ait son interface propre.

## Lot duly-18 (14/11/2026)
- Diagnostic IA rendu aux OUVRIERS (outil de terrain) : menu « Diagnostic IA », champ obligatoire, analyses visibles par le producteur dans son historique (RLS ai_diagnoses_select_member) ; photos lisibles par l'exploitant (policy storage diag_photos_select_farm). Sans clé Anthropic : seule la photo est archivée (« analyse non effectuée »).

## Lot duly-19 (14/11/2026) — Correctifs issus des 2 audits
- Paiement simulé : DÉSACTIVÉ en base (sim_enabled=false). Interrupteur super-admin dans « Vue plateforme » → « Paiement simulé (tests uniquement) ».
- Droits d'exécution : retirés au public (anon) sur seed_demo_data, purge_demo_data, approve_due_referrals, sim_confirm_payment ; coop_set_author fermée. Les aides is_admin/is_committee/is_pro/is_*member restent exécutables (nécessaires aux règles RLS) : retournent seulement vrai/faux.
- Produits interdits : contrôle SERVEUR (trigger block_banned_inputs sur tasks, treatments, farm_inputs, à l'insertion ; liste = active_ingredients.legal_status='interdit' — encore seulement Carbofuran et Diméthoate, à compléter par le comité). Testé : refus d'un texte contenant « Carbofuran ».
- Mot de passe provisoire : changement OBLIGATOIRE à la première connexion (ouvrier créé, réinitialisation, membre du comité) — drapeau must_change_password.
- Traçabilité : audit_logs alimentée (create_worker, reset_worker_password, committee_add/remove/reset_password) ; colonne details.
- Communauté : bouton « 🚩 Signaler » + table coop_reports ; file de modération dans l'espace super-admin.
- IA : bandeau explicite « analyse automatique non disponible ».
- Reste à faire (hors code) : sauvegardes testées (offre Pro), SMTP Brevo, mots de passe compromis (Pro), CGU/confidentialité, nommer le comité, purger la démo, nettoyer ferme du compte acheteur, supprimer Worker dulyahrovia, changer mots de passe provisoires, clé Anthropic, vrai Mobile Money, tests avec vrais ouvriers, test d'intrusion.
- Déploiement : relier GitHub à Claude pour que le déploiement se fasse sans envoi manuel depuis le téléphone.

## Lot duly-20 / V4-0 (14/11/2026) — Mise à niveau et inventaire
- Remise à niveau de main.tsx, community.tsx et CLAUDE.md : lots 17 à 19 réellement présents sur GitHub (écran de changement de mot de passe obligatoire, file de signalements, interrupteur paiement simulé, bandeau IA).
- Ajout (additif) : sources des 5 fonctions serveur dans supabase/functions/ ; journal des migrations dans docs/JOURNAL_MIGRATIONS_SUPABASE.md.
- Déploiement : branche + pull request, validée par le promoteur (décision du 14/11).
- Décisions promoteur : coop_offer_totals_public reste publique (totaux agrégés, vitrine) ; bucket product-labels reste public en lecture (écriture admin).
- À faire (V4-1) : réserver sim_confirm_payment au super admin, grand livre de paiements, passage PRO uniquement par fonction serveur ; mot de passe de admin-create-producer via crypto ; quotas IA ; export SQL complet des migrations.
