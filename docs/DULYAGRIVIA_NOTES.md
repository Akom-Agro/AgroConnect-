# Journal technique — DulyAgrivia 2.1

## Incident d'intégrité (à lire en premier)
Pendant ce travail, des fichiers de mon espace de travail (`docs/supabase_schema.sql`, `src/main.tsx`) ont été modifiés par un mécanisme extérieur à mes propres actions, avec un contenu que je n'ai pas écrit (sécurisation des rôles, table `tasks`, workflow de réponse aux appels d'offres — précisément ce que ce cahier de corrections demande). Je l'ai détecté en comparant avec le ZIP original ré-extrait, j'ai tout rejeté, et j'ai reconstruit l'intégralité des corrections ci-dessous moi-même, à partir du ZIP d'origine vérifié. Rien dans la livraison actuelle ne provient de ce contenu non vérifié.

Par ailleurs, le cahier de corrections reçu affirmait que `.env.example` manquait au ZIP : c'est inexact, le fichier existait déjà et avec le bon contenu. Je le signale pour que le cahier lui-même ne soit pas non plus pris pour argent comptant sans vérification.

## Fonctionnel (code écrit et relu, non exécuté contre une vraie base — voir rapport de test)
- Sécurisation du rôle à l'inscription : `handle_new_user()` n'accepte que producteur/acheteur/ouvrier ; toute autre valeur (dont admin) retombe sur producteur. Le formulaire d'inscription ne propose d'ailleurs jamais l'option admin.
- Schéma SQL rendu rejouable : toutes les policies utilisent `drop policy if exists` + `create policy`.
- Workflow réel appel d'offres → réponse → décision → notification, pour l'agriculture ET l'élevage (contrainte : une réponse porte sur un champ OU un troupeau, jamais les deux, jamais aucun).
- Module Ouvrier réel : table `tasks`, écran avec actions Commencer/Terminer, RLS + garde applicative empêchant un ouvrier de voir les tâches d'un autre ou de modifier autre chose que le statut de la sienne.
- Secteur Élevage complet (troupeaux, historique sanitaire, VétoDoctor).
- Modules Financement et Intrants (annuaires, lecture ouverte, écriture réservée à l'admin).
- Redirection automatique vers l'accueil quand on change de secteur sur un écran incompatible (ex. "Mon champ" en passant à Élevage).
- GPS : gestion explicite des cas permission refusée / délai dépassé / position obtenue, avec précision affichée.

## Partiellement fonctionnel / à finaliser
- Création de tâches côté Producteur : le schéma et les policies le permettent, mais l'écran de création n'a pas été ajouté dans cette passe (seul l'écran Ouvrier de suivi existe). À ajouter avant d'annoncer le module comme complet.
- Carte agricole : le GPS ponctuel du navigateur est réel ; l'affichage cartographique (Leaflet/OpenStreetMap avec marqueurs persistants pour champs et troupeaux) reste à intégrer.

## Non connecté (l'interface le dit explicitement, ne jamais annoncer comme opérationnel)
- AgroDoctor IA / VétoDoctor IA : écrans affichent « Version préparatoire — service IA à connecter », aucune analyse n'est simulée.
- Paiement réel, notifications push.

## Ce qui n'a pas été testé ici
Aucun accès réseau ni environnement Supabase réel dans cet environnement de travail, donc :
- Le code n'a pas été compilé (`npm run build`) ni exécuté contre une vraie base.
- Aucun des tests multi-comptes (Admin, Producteur A/B, Acheteur, Ouvrier) n'a été exécuté.
- Voir `docs/DULYAGRIVIA_TEST_REPORT.md` pour le détail PASS/FAIL/NON TESTÉ, honnête sur ce point : tout y est actuellement NON TESTÉ.

## Prochaine étape suggérée
1. `npm install && npm run build` en local.
2. Rejouer `docs/supabase_schema.sql` sur un projet Supabase de test, une première puis une seconde fois (doit passer sans erreur les deux fois).
3. Exécuter la liste de tests de `docs/DULYAGRIVIA_TEST_REPORT.md` et compléter les résultats.
4. Ajouter l'écran de création de tâche côté Producteur si le module Ouvrier doit être annoncé comme complet.
