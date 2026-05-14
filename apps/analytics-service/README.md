# Analytics Service

Calcule les KPIs affichés dans le dashboard back-office et génère les exports CSV.

## Rôle

- Dashboard global : CA, nombre de commandes, panier moyen, nouveaux clients, taux de conversion (sur une période)
- Ventes par catégorie / par type de produit (SaaS, physique, licence)
- MRR (Monthly Recurring Revenue) basé sur les abos Stripe actifs
- État du stock (produits en rupture / sous le seuil d'alerte)
- Exports CSV : ventes, commandes, abonnements

Toutes les agrégations se font à la volée par requête SQL — pas de table de cache analytique pour rester simple à la démo.

## Patterns RMQ

Queue : `analytics_queue`

**MessagePatterns** : `analytics.get_dashboard`, `analytics.get_sales`, `analytics.get_sales_by_category`, `analytics.get_sales_by_product_type`, `analytics.get_average_cart`, `analytics.get_average_cart_by_product_type`, `analytics.get_mrr`, `analytics.get_stock_status`, `analytics.export_sales`, `analytics.export_orders`, `analytics.export_subscriptions`.

## Source de données

Lit directement les tables `orders`, `order_items`, `subscriptions`, `products` de PostgreSQL (modèle "shared database" volontairement assumé sur ce périmètre).

## Démarrage isolé

```bash
npm run start:dev:analytics
```
