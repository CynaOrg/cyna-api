# Payment Service

Intègre Stripe (paiements one-shot + abonnements récurrents) et gère les licences générées à l'achat.

## Rôle

- `PaymentIntent` pour le checkout one-shot (produits physiques, licences à durée fixe)
- Abonnements Stripe pour les SaaS (mensuel / annuel)
- Réception et vérification des webhooks Stripe (signature obligatoire)
- Émission de licences à l'activation d'un abonnement (génération `licenseKey` unique)
- Cycle de vie abo : `active` / `past_due` / `cancelled` / `unpaid`
- Réagit à `auth.account_deleted` → résiliation immédiate des abos actifs

## Patterns RMQ

Queue : `payment_queue`

**MessagePatterns** :

- Paiement : `payment.create_payment_intent`, `payment.retrieve_payment_intent`
- Abonnements : `payment.create_subscription`, `payment.get_subscriptions`, `payment.get_subscription`, `payment.cancel_subscription`, `payment.admin_update_subscription_terms`
- Licences : `payment.get_user_licenses`, `payment.get_license_by_id`, `payment.activate_license`

**EventPatterns reçus** : `auth.account_deleted`, `payment.webhook_received` (depuis le gateway pour les webhooks Stripe).

**EventPatterns émis** (consommés par order-service + notification-service) : `payment.confirmed`, `payment.failed`, `payment.refunded`, `payment.subscription_created`, `payment.subscription_renewed`, `payment.subscription_past_due`, `payment.subscription_cancelled`, `payment.licenses_issued`.

## Variables clés

```env
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
# Dev only — auto-confirm les paiements 3s après création (sans `stripe listen`)
LOCAL_AUTO_CONFIRM_PAYMENTS=true
```

## Stripe webhooks en local

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
```

Sans ça, set `LOCAL_AUTO_CONFIRM_PAYMENTS=true` dans `.env` pour que le flow checkout marche sans CLI Stripe.

## Démarrage isolé

```bash
npm run start:dev:payment
```
