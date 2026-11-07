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
