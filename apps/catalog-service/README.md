# Catalog Service

Gère le catalogue produits / catégories et le stock physique.

## Rôle

- CRUD produits (SaaS, physiques, licences) avec slug et SEO
- CRUD catégories + reorder
- Upload d'images produits vers Cloudflare R2 (signed URLs)
- Gestion du stock : décrément à la commande, alertes seuil bas, réservations temporaires
- Recherche full-text sur nom / description / tags
- Vues admin séparées (publiées + brouillons + désactivées) vs vues publiques

## Patterns RMQ

Queue : `catalog_queue`

**MessagePatterns** : `catalog.category_*` (create / update / delete / find*all / find_by_slug / reorder), `catalog.product*_`(create / update / delete / bulk_delete / find_all / find_by_slug / find_admin / search / request_upload_url),`catalog.stock\__` (get / update / reserve / release).

**EventPatterns émis** : `catalog.stock_low` (consommé par notification-service pour alerter l'équipe).

## Stockage

- PostgreSQL : `products`, `categories`, `product_images`, `stock_reservations`
- Cloudflare R2 : images produits (URL publique via `R2_PUBLIC_URL`)

## Variables clés

```env
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=cyna-product-images
R2_PUBLIC_URL=https://pub-xxx.r2.dev
STOCK_RESERVATION_EXPIRY_MINUTES=15
STOCK_ALERT_DEFAULT_THRESHOLD=10
```

## Démarrage isolé

```bash
npm run start:dev:catalog
```
