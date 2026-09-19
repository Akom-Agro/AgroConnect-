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
update public.profiles set role='admin' where id='UUID_DU_COMPTE';
```
Cette opération doit être faite uniquement par le propriétaire de la base.

## 7. OPÉRATIONNEL (relié à une vraie base Supabase, non testé en conditions réelles par nos soins)
Auth, profils, rôles (avec blocage serveur du rôle admin à l'inscription), fermes, champs, cultures, prévisions de récolte, troupeaux et suivi sanitaire, marché/appels d'offres (agriculture ET élevage), **réponse réelle du Producteur à un appel d'offres**, **acceptation/refus par l'Acheteur avec notification**, **tâches Ouvrier réelles** (assignation, statuts, isolation stricte par ouvrier), annuaires Financement et Intrants, statistiques administrateur, GPS navigateur avec gestion des erreurs de permission.

## 8. EN PRÉPARATION (interface présente, service réel non branché — ne pas annoncer comme disponible)
- Diagnostic IA (AgroDoctor / VétoDoctor) : l'écran l'indique explicitement, aucune analyse n'est simulée.
- Cartographie avancée (Leaflet/OpenStreetMap avec marqueurs persistants) : seul le GPS ponctuel du navigateur est actif.
- Paiement réel, notifications push.

## 9. Sécurité
RLS est activé. Tester obligatoirement avec deux comptes Producteur distincts, un Acheteur et un compte Ouvrier avant mise en production.
