# User Service

Source de vérité de l'entité `User` et de ses données associées (adresses, profil). Extrait d'`auth-service` pour respecter le découpage par domaine.

## Rôle

- CRUD User (création à l'inscription, lecture par id / email, update profil)
- Gestion des adresses de livraison / facturation
- Liaison Stripe Customer ID
- Admin : liste paginée, détail, activation / désactivation d'un user
- Émet `user.deleted` quand un compte est supprimé (consommé par auth-service et payment-service pour révocation tokens + résiliation abos)

## Patterns RMQ

Queue : `user_queue`

**MessagePatterns** principaux :

- User : `user.create`, `user.find_by_email`, `user.find_by_email_for_login`, `user.get_by_id`, `user.mark_verified`, `user.update_password_hash`, `user.update_stripe_customer_id`, `user.get_profile`
- Adresses : `user.get_addresses`, `user.create_address`, `user.update_address`, `user.delete_address`
- Admin : `user.admin_list`, `user.admin_get`, `user.admin_update_status`

## Stockage

- PostgreSQL : tables `users`, `user_addresses`

## Démarrage isolé

```bash
npm run start:dev:user
```
