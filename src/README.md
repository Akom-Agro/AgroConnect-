# DulyAgrivia 2.1 — Production

Anciennement AgroConnect 2.0. Version de production préparée pour déploiement web/PWA. Cette version n'utilise aucune donnée de démonstration lorsqu'elle est configurée avec Supabase.

## 1. Prérequis
- Node.js 20+
- Un projet Supabase
- URL Supabase et clé publique anon

## 2. Configuration
Copier `.env.example` vers `.env.local` et renseigner :
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Ne jamais placer une `service_role` ou autre clé secrète dans une variable `VITE_*`.

## 3. Base de données
Dans Supabase > SQL Editor, exécuter `docs/supabase_schema.sql` sur un projet neuf ou après sauvegarde si une base existe déjà.

Le script crée les tables, le trigger de profil, le catalogue des cultures et les politiques RLS de base.

## 3bis. Alimenter Financement et Intrants
Les tables `funding_programs` et `input_products` sont vides à l'installation : ce sont des annuaires que vous remplissez vous-même (aucun contact n'est pris automatiquement pour votre compte). Depuis Supabase > Table Editor, ajoutez vos lignes, par exemple :
```sql
insert into public.funding_programs (name, organization, sector, region, description, contact_url)
values ('Programme XYZ', 'Nom du bailleur', 'both', 'Afrique centrale', 'Description courte', 'https://...');
```

## 4. Test local
```bash
npm install
npm run build
npm run dev
```

## 5. Déploiement Netlify
- Build command : `npm run build`
- Publish directory : `dist`
- Variables d'environnement : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Le fichier `netlify.toml` est inclus.

## 6. Premier compte administrateur
Créer un compte normalement. Puis, depuis Supabase SQL Editor, après vérification de son UUID :
```sql
update public.profiles set role='super_admin' where id='UUID_DU_COMPTE';
```
`super_admin` est le rôle réellement utilisé en production (reconnu partout via `is_admin()` côté SQL et `isAdminRole()` côté frontend — le rôle `admin` seul reste accepté par compatibilité mais `super_admin` est recommandé). Cette opération doit être faite uniquement par le propriétaire de la base. L'accès admin se fait via `https://votre-site/?admin` (portail séparé, jamais accessible par inscription publique).

## 7. OPÉRATIONNEL (relié à une vraie base Supabase, testé en direct sur la base de production — voir journal de vérifications ci-dessous)
- Accès public sans compte (portail avec catalogue d'offres réelles + appels d'offres), connexion/inscription séparées, récupération de mot de passe
- Rôles Producteur/Acheteur auto-sélectionnés à l'inscription (jamais Admin), invitation Ouvrier par code généré par le producteur (rattachement vérifié côté serveur, trigger `handle_new_user`)
- Fermes (multi-exploitations par producteur), champs, cultures, prévisions de récolte recalculables et corrigibles, troupeaux et suivi sanitaire
- **Gratuit/PRO** : tarifs configurables, statut PRO vérifié côté serveur (`is_pro()`), avec expiration réelle
- **Commission sur ventes** : calculée et verrouillée automatiquement côté serveur à chaque transaction (jamais fournie par le client), historisée
- **Marché réel** : offres publiées par les producteurs PRO (statuts disponible maintenant/prochainement/programmée/appel d'offres), prix de référence DulyAgrivia affiché séparément du prix du vendeur, ventes groupées entre producteurs
- **Programme de parrainage** : code/lien unique par profil, capture automatique à l'inscription, anti-auto-parrainage et anti-boucle (testés), conversion qualifiante = paiement PRO réellement confirmé (pas l'inscription seule), délai de validation anti-fraude configurable, jamais d'approbation automatique
- **Paiements** : `payment_intents` ne peut plus être modifié par le client lui-même (faille corrigée — seul un admin ou le `service_role` peut confirmer un paiement), journal d'audit de tous les changements de statut (`payment_status_log`)
- Appels d'offres (réponse Producteur, acceptation/refus Acheteur), tâches Ouvrier (isolation stricte par ouvrier), annuaires Financement et Intrants, tableau Super Admin (statistiques, utilisateurs, tarification, commission, parrainage, paiements en attente de confirmation manuelle)

## 8. EN PRÉPARATION (interface présente, service réel NON branché — ne pas annoncer comme disponible)
- **Paiement réel (Flutterwave / CinetPay / Orange Money / MTN MoMo / Stripe)** : aucune passerelle n'est connectée. Le bouton "Passer à PRO" enregistre une demande (`payment_intents`, statut `non_configure`) traitée manuellement par un Super Admin depuis son tableau de bord. Le flux serveur (Edge Function de webhook signé, confirmation avant activation, idempotence) est prévu dans le schéma (colonnes `provider_reference`, `idempotency_key`, statuts `pending/successful/failed/cancelled/refunded`) mais la fonction de webhook elle-même reste à écrire une fois un compte marchand Flutterwave ou CinetPay créé et ses clés fournies (jamais dans le frontend — uniquement en secret Supabase Edge Function).
- Diagnostic IA (AgroDoctor / VétoDoctor) : l'écran l'indique explicitement, aucune analyse n'est simulée.
- Cartographie avancée (Leaflet/OpenStreetMap avec marqueurs persistants) : seul le GPS ponctuel du navigateur est actif.
- Notifications push.
- Gestion des rôles/statuts utilisateurs depuis l'interface Admin (actuellement lecture seule — le changement se fait encore manuellement dans Supabase).

## 9. Sécurité
RLS est activé sur toutes les tables sensibles. Faille corrigée le 1er octobre 2026 : un utilisateur pouvait auparavant modifier lui-même le statut de son propre paiement (`payment_intents`) — un client malveillant aurait pu se déclarer "payé" sans paiement réel. Seul un administrateur (ou le `service_role` depuis une future Edge Function) peut désormais changer ce statut. Tester obligatoirement avec deux comptes Producteur distincts, un Acheteur et un compte Ouvrier avant mise en production.
