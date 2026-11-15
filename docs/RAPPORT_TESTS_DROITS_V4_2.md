# Rapport de tests des droits d'accès — V4-2 (15/11/2026)

Méthode : sessions simulées en base avec les vrais comptes (producteur, ouvrier, acheteur, super admin), puis annulation (aucune donnée modifiée). Seul 1 producteur réel existe : l'isolement producteur A / producteur B n'est donc testé que par « lignes de fermes d'autrui visibles = 0 » et par des écritures chez autrui.

## Résultats (tous conformes)
| Test | Résultat |
|---|---|
| Producteur : lignes (champs, tâches, produits, ouvriers, invitations) d'une ferme d'autrui visibles | 0 |
| Producteur : créer une tâche / un produit chez autrui | refusé (RLS 42501) |
| Producteur : modifier la ferme d'autrui | 0 ligne modifiée |
| Ouvrier : créer une ferme, une invitation, un paiement déjà « réussi », s'ajouter au comité, écrire dans audit_logs, notifier autrui | tous refusés (RLS 42501) |
| Acheteur : créer une ferme | refusé |
| Acheteur : publier une offre | refusé (réservé PRO/admin, règle RLS lue) |
| Vendeur : se publier lui-même ou modifier une offre déjà publiée | refusé (trigger de modération) |
| Utilisateur : modifier plan / pro_expires_at / referral_code / role de son profil | refusé (corrigé en V4-1) |
| Paiement : réussi → en attente / refusé ; remboursé → réussi | refusés (corrigé en V4-2) |

## Limites et points ouverts
- Le compte acheteur voit 1 ferme et 1 invitation : ferme créée avant la règle du lot 16. À nettoyer (décision du promoteur).
- Pas de test avec un 2e producteur réel : à refaire quand 2 producteurs réels existent.
- Tables non testées en écriture : le détail de chaque table n'est pas couvert, seulement les tables sensibles ci-dessus.
- admin-create-producer corrigée : mot de passe par crypto, changement obligatoire à la 1re connexion, trace dans audit_logs, e-mail validé.
