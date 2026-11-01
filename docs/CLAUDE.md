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
