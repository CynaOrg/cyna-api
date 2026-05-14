# Content Service

Petit CMS interne pour les blocs éditables de la homepage (carrousel, sélections, hero) et le formulaire de contact.

## Rôle

- Carrousel homepage : slides ordonnés, upload images vers R2 via signed URL
- Top services / produits / licences : sélection manuelle côté admin
- Hero text (titre + sous-titre) éditable depuis le back-office
- FAQ (Q/R simples)
- Réception des messages du formulaire de contact → émet `content.contact_message_received` pour notification-service

## Patterns RMQ

Queue : `content_queue`

**MessagePatterns publics** : `content.get_homepage`, `content.get_carousel`, `content.get_top_services`, `content.get_top_products`, `content.get_top_licenses`, `content.create_contact_message`.

**MessagePatterns admin** : `content.admin_get_carousel`, `content.admin_create_slide`, `content.admin_update_slide`, `content.admin_delete_slide`, `content.admin_reorder_carousel`, `content.carousel_request_upload_url`, `content.admin_get_hero_text`, `content.admin_update_hero_text`, `content.admin_get_top_services`, etc.

**EventPatterns émis** : `content.contact_message_received`.

## Stockage

- PostgreSQL : `carousel_slides`, `hero_text`, `top_selections`, `contact_messages`, `faq_entries`
- Cloudflare R2 : images du carrousel (même bucket que catalog)

## Démarrage isolé

```bash
npm run start:dev:content
```
