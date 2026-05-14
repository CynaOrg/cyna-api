# Order Service

Gère le panier et le cycle de vie des commandes.

## Rôle

- Panier user ET panier invité (clé : userId ou anonymousCartId)
- Merge automatique du panier invité vers le panier user au login
- Création de commande, calcul totaux, snapshot produit/prix à la commande
- Réagit aux events paiement : `payment.confirmed` → `paid`, `payment.failed` → `failed`, `payment.refunded` → `refunded`
- Admin : liste, détail, update du statut (`paid` / `shipped` / `delivered` / `cancelled`)
- Snapshot `email` + `preferredLanguage` sur l'order pour que les emails downstream soient localisés

## Crons

| Cron                       | Fréquence         | Rôle                                                                          |
| -------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| `CartAbandonedCron`        | toutes les heures | Émet `order.cart_abandoned` après inactivité → email de relance               |
| `PendingOrdersCleanupCron` | toutes les 5 min  | Annule les commandes `pending` > X min sans paiement, libère le stock réservé |
| `GuestCartCleanupCron`     | quotidien         | Purge les paniers invités inactifs > 30j                                      |

## Patterns RMQ

Queue : `order_queue`

**MessagePatterns** : `order.get_cart`, `order.add_cart_item`, `order.update_cart_item`, `order.remove_cart_item`, `order.clear_cart`, `order.merge_guest_cart`, `order.create_order`, `order.get_orders`, `order.get_order`, `order.get_order_by_payment_intent`, `order.admin_get_orders`, `order.admin_update_status`.

**EventPatterns reçus** : `payment.confirmed`, `payment.failed`, `payment.refunded`.

**EventPatterns émis** : `order.shipped`, `order.checkout_expired`, `order.cart_abandoned`.

## Stockage

- PostgreSQL : `carts`, `cart_items`, `orders`, `order_items`

## Démarrage isolé

```bash
npm run start:dev:order
```
