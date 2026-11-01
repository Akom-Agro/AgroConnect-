# DulyAgrivia 2.1 — Dossier de production

Ce dossier est la base destinée au déploiement réel. Il est conçu pour être construit par Netlify à partir du code source.

## Ce qui est réel dans cette livraison
- Authentification Supabase e-mail/mot de passe.
- Création automatique du profil à l'inscription, rôle validé côté serveur (admin jamais assignable par inscription publique).
- Gestion des rôles Producteur / Acheteur / Ouvrier / Admin.
- Fermes, champs et troupeaux persistants (agriculture ET élevage).
- GPS du navigateur pour renseigner un champ, avec gestion des erreurs de permission/délai.
- Catalogues de cultures et d'espèces animales.
- Calcul de date de récolte à partir du cycle de la culture.
- Appels d'offres persistants (agriculture et élevage), avec réponse réelle du Producteur (champ ou troupeau), acceptation/refus par l'Acheteur et notification automatique au Producteur.
- Marché basé sur les appels d'offres ouverts.
- Tâches Ouvrier réelles : assignation par le Producteur, changement de statut par l'Ouvrier, isolation stricte (RLS + garde applicative).
- Annuaires Financement et Intrants (à alimenter, voir README section 3bis).
- Notifications persistantes, déclenchées par le workflow des appels d'offres.
- Statistiques administrateur.
- RLS complet et protection du rôle, script SQL rejouable sans erreur.
- PWA/Netlify.

## Ce qui exige un service externe avant annonce publique
- Diagnostic IA : la fonction serveur doit être reliée à un fournisseur IA et à sa clé secrète.
- Paiements : aucun paiement ne doit être simulé ; connecter le fournisseur choisi et ses webhooks.
- Notifications push : connecter le fournisseur choisi si elles sont nécessaires.
- Cartographie avancée : ajouter Leaflet/OpenStreetMap lorsque les marqueurs persistants doivent être affichés ; le GPS du navigateur est déjà géré.

## Pourquoi ces éléments ne sont pas simulés
Une version de production ne doit jamais afficher « paiement réussi », « diagnostic IA terminé » ou « notification push envoyée » sans que le service réel ait confirmé l'opération.
