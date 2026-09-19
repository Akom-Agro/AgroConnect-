# Déploiement DulyAgrivia 2.1

## Test local

1. Installer Node.js 20+.
2. Dans le dossier du projet : `npm install`.
3. Lancer : `npm run dev`.
4. Tester Chrome Android et Samsung Internet.

## Netlify

Le fichier `netlify.toml` est déjà fourni.

Configuration recommandée :
- Build command : `npm run build`
- Publish directory : `dist`

Variables d'environnement :
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Important avant lancement public

La version fournie ne doit pas être présentée comme une version de production tant que :
- Auth n'est pas reliée au backend ;
- RLS n'est pas validé ;
- les CRUD métier ne sont pas reliés à Supabase ;
- les appels IA ne passent pas par un serveur/Edge Function ;
- les paiements ne sont pas intégrés et testés ;
- les tests multi-comptes ne sont pas validés.
