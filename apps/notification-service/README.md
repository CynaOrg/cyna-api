# Notification Service

Service purement réactif : ne fait rien tout seul, consomme les events des autres services et envoie les emails correspondants.

## Rôle

- Rendu de templates Handlebars (fr / en) selon `preferredLanguage` snapshotté sur Order / Subscription
- Envoi via Nodemailer (SMTP)
- Catalogue d'emails couvrant tout le cycle de vie : inscription, vérification, reset password, 2FA admin, confirmation commande, paiement OK / KO, abo créé / renouvelé / past_due / annulé, licences émises, expédition, alerte stock bas, message contact reçu

## EventPatterns consommés

Queue : `notification.emails`

**Auth** : `auth.user_registered`, `auth.user_verified`, `auth.password_reset_requested`, `auth.password_reset_completed`, `auth.password_changed`, `auth.admin_2fa_code_requested`.

**Payment** : `payment.confirmed`, `payment.failed`, `payment.refunded`, `payment.subscription_created`, `payment.subscription_renewed`, `payment.subscription_past_due`, `payment.subscription_cancelled`, `payment.licenses_issued`.

**Order** : `order.shipped`, `order.checkout_expired`, `order.cart_abandoned`.

**Catalog** : `catalog.stock_low`.

**Content** : `content.contact_message_received`.

## Variables clés

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM_EMAIL=noreply@cyna.io
SMTP_FROM_NAME=CYNA
DEFAULT_LANGUAGE=fr
FALLBACK_LANGUAGE=en
FRONTEND_URL=http://localhost:4200    # liens dans les emails
BACKOFFICE_URL=http://localhost:4201
```

## Templates

Localisés dans `apps/notification-service/src/email/templates/{fr,en}/*.hbs`.

## Démarrage isolé

```bash
npm run start:dev:notification
```
