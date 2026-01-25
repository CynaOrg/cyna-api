# CYNA — Data Model

> **Version:** 1.4  
> **Date:** 21 janvier 2026  
> **Stack:** PostgreSQL + TypeORM (NestJS)  
> **Mise à jour:** Ajout STOCK_RESERVATION pour la gestion des réservations de stock pendant le checkout

---

## 📊 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CYNA DATA MODEL                                │
│                              (17 entités)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────────┐  │
│  │  USER   │────<│   ADDRESS   │     │  CATEGORY   │────<│   PRODUCT    │  │
│  └────┬────┘     └─────────────┘     └─────────────┘     └──────┬───────┘  │
│       │                                                         │          │
│       │                                                  ┌──────┴───────┐  │
│       │                                                  │PRODUCT_IMAGE │  │
│       │                                                  ├──────────────┤  │
│       │                                                  │PRODUCT_CHAR. │  │
│       │                                                  ├──────────────┤  │
│       │                                                  │STOCK_RESERV. │  │
│       │                                                  └──────┬───────┘  │
│       │          ┌─────────────┐                                │          │
│       └─────────<│    ORDER    │>───────────────────────────────┘          │
│       │          └──────┬──────┘                                           │
│       │                 │                                                  │
│       │          ┌──────┴──────┐                                           │
│       │          │ ORDER_ITEM  │                                           │
│       │          └─────────────┘                                           │
│       │                                                                    │
│       │          ┌──────────────┐    ┌─────────────┐                       │
│       └─────────<│ SUBSCRIPTION │───>│   PRODUCT   │                       │
│       │          └──────────────┘    │   (SaaS)    │                       │
│       │                              └─────────────┘                       │
│       │                                                                    │
│       └─────────<│     CART     │───<│  CART_ITEM  │                       │
│                  └──────────────┘    └─────────────┘                       │
│                                                                            │
│  ┌──────────┐    ┌──────────────┐    ┌─────────────────┐                   │
│  │  ADMIN   │───<│ADMIN_2FA_CODE│    │ CONTACT_MESSAGE │                   │
│  └──────────┘    └──────────────┘    └─────────────────┘                   │
│                                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Entités

---

### 1. USER (Utilisateur client)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `email` | `VARCHAR(255)` | UNIQUE, NOT NULL | Email de connexion |
| `password_hash` | `VARCHAR(255)` | NOT NULL | Mot de passe hashé (bcrypt) |
| `first_name` | `VARCHAR(100)` | NOT NULL | Prénom |
| `last_name` | `VARCHAR(100)` | NOT NULL | Nom |
| `company_name` | `VARCHAR(255)` | NULL | Nom de l'entreprise (B2B) |
| `is_active` | `BOOLEAN` | DEFAULT true | Compte actif |
| `is_verified` | `BOOLEAN` | DEFAULT false | Email vérifié |
| `preferred_language` | `ENUM('fr', 'en')` | DEFAULT 'fr' | Langue préférée |
| `stripe_customer_id` | `VARCHAR(255)` | NULL, UNIQUE | ID client Stripe |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |
| `updated_at` | `TIMESTAMP` | ON UPDATE | Date de modification |

**Index:**
- `idx_user_email` ON `email`
- `idx_user_stripe` ON `stripe_customer_id`

**Relations:**
- `USER (1) ←→ (N) ADDRESS`
- `USER (1) ←→ (N) ORDER`
- `USER (1) ←→ (N) SUBSCRIPTION`
- `USER (1) ←→ (1) CART`

---

### 2. ADMIN (Administrateur back-office)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `email` | `VARCHAR(255)` | UNIQUE, NOT NULL | Email de connexion |
| `password_hash` | `VARCHAR(255)` | NOT NULL | Mot de passe hashé |
| `first_name` | `VARCHAR(100)` | NOT NULL | Prénom |
| `last_name` | `VARCHAR(100)` | NOT NULL | Nom |
| `role` | `ENUM('super_admin', 'commercial')` | DEFAULT 'commercial' | Rôle |
| `is_active` | `BOOLEAN` | DEFAULT true | Compte actif |
| `last_login_at` | `TIMESTAMP` | NULL | Dernière connexion |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |
| `updated_at` | `TIMESTAMP` | ON UPDATE | Date de modification |

**Rôles:**
- `super_admin` : Accès complet (produits, commandes, utilisateurs, analytics, paramètres)
- `commercial` : Analytics et reporting uniquement

**Relations:**
- `ADMIN (1) ←→ (N) ADMIN_2FA_CODE`
- `ADMIN (1) ←→ (N) CONTACT_MESSAGE` (processed_by)

---

### 3. ADMIN_2FA_CODE (Code 2FA Admin)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `admin_id` | `UUID` | FK → ADMIN, NOT NULL | Administrateur |
| `code` | `VARCHAR(6)` | NOT NULL | Code à 6 chiffres |
| `expires_at` | `TIMESTAMP` | NOT NULL | Expiration (5 min) |
| `used_at` | `TIMESTAMP` | NULL | Date d'utilisation |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |

**Flow 2FA:**
1. Admin entre email + mot de passe → validés
2. Génération code 6 chiffres → stocké ici → envoyé par email
3. Admin entre le code → vérification → accès accordé
4. Code expire après 5 minutes ou après utilisation

**Index:**
- `idx_2fa_admin` ON `admin_id`
- `idx_2fa_expires` ON `expires_at`

---

### 4. ADDRESS (Adresse)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `user_id` | `UUID` | FK → USER, NOT NULL | Utilisateur |
| `label` | `VARCHAR(100)` | NULL | Libellé (ex: "Bureau", "Domicile") |
| `first_name` | `VARCHAR(100)` | NOT NULL | Prénom destinataire |
| `last_name` | `VARCHAR(100)` | NOT NULL | Nom destinataire |
| `company` | `VARCHAR(255)` | NULL | Entreprise |
| `street_line_1` | `VARCHAR(255)` | NOT NULL | Adresse ligne 1 |
| `street_line_2` | `VARCHAR(255)` | NULL | Adresse ligne 2 |
| `city` | `VARCHAR(100)` | NOT NULL | Ville |
| `postal_code` | `VARCHAR(20)` | NOT NULL | Code postal |
| `country` | `VARCHAR(2)` | NOT NULL, DEFAULT 'FR' | Code pays ISO |
| `phone` | `VARCHAR(20)` | NULL | Téléphone |
| `is_default_billing` | `BOOLEAN` | DEFAULT false | Adresse facturation par défaut |
| `is_default_shipping` | `BOOLEAN` | DEFAULT false | Adresse livraison par défaut |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |
| `updated_at` | `TIMESTAMP` | ON UPDATE | Date de modification |

**Index:**
- `idx_address_user` ON `user_id`

---

### 5. CATEGORY (Catégorie)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `slug` | `VARCHAR(100)` | UNIQUE, NOT NULL | Slug URL |
| `name_fr` | `VARCHAR(100)` | NOT NULL | Nom en français |
| `name_en` | `VARCHAR(100)` | NOT NULL | Nom en anglais |
| `description_fr` | `TEXT` | NULL | Description FR |
| `description_en` | `TEXT` | NULL | Description EN |
| `image_url` | `VARCHAR(500)` | NULL | URL image (Cloudflare R2) |
| `display_order` | `INTEGER` | DEFAULT 0 | Ordre d'affichage |
| `is_active` | `BOOLEAN` | DEFAULT true | Catégorie active |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |
| `updated_at` | `TIMESTAMP` | ON UPDATE | Date de modification |

**Catégories prévues:**
- `services` → Services SaaS (SOC, EDR, XDR)
- `produits` → Produits physiques

**Index:**
- `idx_category_slug` ON `slug`

**Relations:**
- `CATEGORY (1) ←→ (N) PRODUCT`

---

### 6. PRODUCT (Produit / Service)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `category_id` | `UUID` | FK → CATEGORY, NOT NULL | Catégorie |
| `slug` | `VARCHAR(150)` | UNIQUE, NOT NULL | Slug URL |
| `sku` | `VARCHAR(50)` | UNIQUE, NOT NULL | Référence produit |
| `name_fr` | `VARCHAR(200)` | NOT NULL | Nom en français |
| `name_en` | `VARCHAR(200)` | NOT NULL | Nom en anglais |
| `description_fr` | `TEXT` | NOT NULL | Description FR |
| `description_en` | `TEXT` | NOT NULL | Description EN |
| `short_description_fr` | `VARCHAR(300)` | NULL | Description courte FR |
| `short_description_en` | `VARCHAR(300)` | NULL | Description courte EN |
| `product_type` | `ENUM('saas', 'digital', 'physical')` | NOT NULL | Type de produit |
| `price_monthly` | `DECIMAL(10,2)` | NULL | Prix mensuel (SaaS uniquement) |
| `price_yearly` | `DECIMAL(10,2)` | NULL | Prix annuel (SaaS uniquement) |
| `price_unit` | `DECIMAL(10,2)` | NULL | Prix unitaire (digital & physical) |
| `stock_quantity` | `INTEGER` | NULL | Stock total (physical uniquement) |
| `stock_alert_threshold` | `INTEGER` | DEFAULT 10 | Seuil alerte stock |
| `is_available` | `BOOLEAN` | DEFAULT true | Disponible à la vente |
| `is_featured` | `BOOLEAN` | DEFAULT false | Mis en avant (Top produits) |
| `display_order` | `INTEGER` | DEFAULT 0 | Ordre d'affichage |
| `stripe_price_id_monthly` | `VARCHAR(255)` | NULL | ID Stripe prix mensuel |
| `stripe_price_id_yearly` | `VARCHAR(255)` | NULL | ID Stripe prix annuel |
| `stripe_price_id_unit` | `VARCHAR(255)` | NULL | ID Stripe prix unitaire |
| `stripe_product_id` | `VARCHAR(255)` | NULL | ID Stripe produit |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |
| `updated_at` | `TIMESTAMP` | ON UPDATE | Date de modification |

**Types de produits:**
- `saas` : Services avec abonnement récurrent (SOC, EDR, XDR) — `price_monthly` / `price_yearly`
- `digital` : Produits dématérialisés, achat unique (licences, équipements virtuels) — `price_unit`, pas de stock
- `physical` : Produits physiques, achat unique + livraison (baie serveur, disque dur) — `price_unit` + `stock_quantity`

**Calcul du stock disponible (physical uniquement):**
```sql
stock_available = stock_quantity - (SELECT COALESCE(SUM(quantity), 0) 
                                    FROM stock_reservations 
                                    WHERE product_id = :id 
                                    AND expires_at > NOW())
```

**Index:**
- `idx_product_slug` ON `slug`
- `idx_product_sku` ON `sku`
- `idx_product_category` ON `category_id`
- `idx_product_type` ON `product_type`
- `idx_product_featured` ON `is_featured` WHERE `is_featured = true`

**Relations:**
- `PRODUCT (N) ←→ (1) CATEGORY`
- `PRODUCT (1) ←→ (N) PRODUCT_IMAGE`
- `PRODUCT (1) ←→ (N) PRODUCT_CHARACTERISTIC`
- `PRODUCT (1) ←→ (N) STOCK_RESERVATION`
- `PRODUCT (1) ←→ (N) ORDER_ITEM`
- `PRODUCT (1) ←→ (N) SUBSCRIPTION`
- `PRODUCT (1) ←→ (N) CART_ITEM`

---

### 7. PRODUCT_IMAGE (Images produit)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `product_id` | `UUID` | FK → PRODUCT, NOT NULL | Produit |
| `image_url` | `VARCHAR(500)` | NOT NULL | URL image (Cloudflare R2) |
| `alt_text_fr` | `VARCHAR(255)` | NULL | Texte alternatif FR |
| `alt_text_en` | `VARCHAR(255)` | NULL | Texte alternatif EN |
| `display_order` | `INTEGER` | DEFAULT 0 | Ordre d'affichage |
| `is_primary` | `BOOLEAN` | DEFAULT false | Image principale (thumbnail) |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |

**Règle métier:** Un seul `is_primary = true` par produit.

**Index:**
- `idx_product_image_product` ON `product_id`

---

### 8. PRODUCT_CHARACTERISTIC (Caractéristiques produit)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `product_id` | `UUID` | FK → PRODUCT, NOT NULL | Produit |
| `key_fr` | `VARCHAR(100)` | NOT NULL | Clé FR (ex: "Surveillance") |
| `key_en` | `VARCHAR(100)` | NOT NULL | Clé EN (ex: "Monitoring") |
| `value_fr` | `VARCHAR(255)` | NOT NULL | Valeur FR (ex: "24/7") |
| `value_en` | `VARCHAR(255)` | NOT NULL | Valeur EN |
| `display_order` | `INTEGER` | DEFAULT 0 | Ordre d'affichage |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |
| `updated_at` | `TIMESTAMP` | ON UPDATE | Date de modification |

**Exemples de caractéristiques:**
| Clé FR | Valeur FR | Clé EN | Valeur EN |
|--------|-----------|--------|-----------|
| Surveillance | 24/7 | Monitoring | 24/7 |
| Endpoints | Illimités | Endpoints | Unlimited |
| Support | Premium | Support | Premium |
| Détection | Temps réel | Detection | Real-time |

**Index:**
- `idx_characteristic_product` ON `product_id`

---

### 9. STOCK_RESERVATION (Réservation de stock) — NOUVEAU ✨

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `product_id` | `UUID` | FK → PRODUCT, NOT NULL | Produit physique |
| `cart_id` | `UUID` | FK → CART, NOT NULL | Panier associé |
| `user_id` | `UUID` | FK → USER, NULL | Utilisateur (NULL si guest) |
| `quantity` | `INTEGER` | NOT NULL | Quantité réservée |
| `expires_at` | `TIMESTAMP` | NOT NULL | Date d'expiration (15 min) |
| `confirmed_at` | `TIMESTAMP` | NULL | Date de confirmation (paiement OK) |
| `released_at` | `TIMESTAMP` | NULL | Date de libération (annulation) |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |

**Règles métier:**
- Réservation créée au début du checkout pour les produits `physical`
- Durée de réservation : 15 minutes par défaut
- `confirmed_at` rempli → stock décrémenté définitivement
- `released_at` rempli → réservation annulée manuellement
- Expiration automatique si `expires_at < NOW()` et `confirmed_at IS NULL`

**Flow de réservation:**
```
1. User démarre checkout avec produit physique
   → Catalog Service vérifie stock_available > quantity
   → Création STOCK_RESERVATION (expires_at = NOW + 15min)
   → Retourne OK + reservation_id

2. Paiement réussit (webhook Stripe)
   → Order Service appelle Catalog.confirmReservation(cart_id)
   → confirmed_at = NOW()
   → stock_quantity -= quantity (décrémentation définitive)
   → Suppression de la réservation

3. Paiement échoue OU timeout 15min
   → Cron job toutes les minutes : DELETE WHERE expires_at < NOW() AND confirmed_at IS NULL
   → Stock automatiquement libéré

4. User vide son panier avant paiement
   → Order Service appelle Catalog.releaseReservation(cart_id)
   → released_at = NOW() puis suppression
```

**Index:**
- `idx_reservation_product` ON `product_id`
- `idx_reservation_cart` ON `cart_id`
- `idx_reservation_expires` ON `expires_at` WHERE `confirmed_at IS NULL`
- `idx_reservation_user` ON `user_id`

**Relations:**
- `STOCK_RESERVATION (N) ←→ (1) PRODUCT`
- `STOCK_RESERVATION (N) ←→ (1) CART`
- `STOCK_RESERVATION (N) ←→ (1) USER`

---

### 10. ORDER (Commande)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `order_number` | `VARCHAR(20)` | UNIQUE, NOT NULL | Numéro (ex: CYN-2026-00001) |
| `user_id` | `UUID` | FK → USER, NULL | Utilisateur (NULL si guest) |
| `guest_email` | `VARCHAR(255)` | NULL | Email si commande invité |
| `status` | `ENUM(...)` | NOT NULL, DEFAULT 'pending' | Statut commande |
| `order_type` | `ENUM('saas', 'physical', 'mixed')` | NOT NULL | Type de commande |
| `subtotal` | `DECIMAL(10,2)` | NOT NULL | Sous-total HT |
| `tax_amount` | `DECIMAL(10,2)` | NOT NULL | Montant TVA |
| `shipping_amount` | `DECIMAL(10,2)` | DEFAULT 0 | Frais de livraison |
| `discount_amount` | `DECIMAL(10,2)` | DEFAULT 0 | Réduction |
| `total` | `DECIMAL(10,2)` | NOT NULL | Total TTC |
| `currency` | `VARCHAR(3)` | DEFAULT 'EUR' | Devise |
| `billing_address_snapshot` | `JSONB` | NOT NULL | Snapshot adresse facturation |
| `shipping_address_snapshot` | `JSONB` | NULL | Snapshot adresse livraison |
| `stripe_payment_intent_id` | `VARCHAR(255)` | NULL | ID PaymentIntent Stripe |
| `stripe_checkout_session_id` | `VARCHAR(255)` | NULL | ID Checkout Session |
| `paid_at` | `TIMESTAMP` | NULL | Date de paiement |
| `shipped_at` | `TIMESTAMP` | NULL | Date d'expédition |
| `delivered_at` | `TIMESTAMP` | NULL | Date de livraison |
| `tracking_number` | `VARCHAR(100)` | NULL | Numéro de suivi |
| `tracking_url` | `VARCHAR(500)` | NULL | URL de suivi |
| `notes` | `TEXT` | NULL | Notes internes |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |
| `updated_at` | `TIMESTAMP` | ON UPDATE | Date de modification |

**Statuts (`status`):**
```
pending          → En attente de paiement
paid             → Payé
processing       → En cours de traitement
shipped          → Expédié (physique)
delivered        → Livré (physique)
completed        → Terminé
cancelled        → Annulé
refunded         → Remboursé
```

**Index:**
- `idx_order_user` ON `user_id`
- `idx_order_number` ON `order_number`
- `idx_order_status` ON `status`
- `idx_order_created` ON `created_at`

**Relations:**
- `ORDER (N) ←→ (1) USER`
- `ORDER (1) ←→ (N) ORDER_ITEM`

---

### 11. ORDER_ITEM (Ligne de commande)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `order_id` | `UUID` | FK → ORDER, NOT NULL | Commande |
| `product_id` | `UUID` | FK → PRODUCT, NOT NULL | Produit |
| `product_snapshot` | `JSONB` | NOT NULL | Snapshot produit au moment de l'achat |
| `quantity` | `INTEGER` | NOT NULL, DEFAULT 1 | Quantité |
| `unit_price` | `DECIMAL(10,2)` | NOT NULL | Prix unitaire |
| `total_price` | `DECIMAL(10,2)` | NOT NULL | Prix total ligne |
| `billing_period` | `ENUM('monthly', 'yearly', 'one_time')` | NOT NULL | Période de facturation |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |

**Index:**
- `idx_order_item_order` ON `order_id`
- `idx_order_item_product` ON `product_id`

---

### 12. SUBSCRIPTION (Abonnement SaaS)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `user_id` | `UUID` | FK → USER, NOT NULL | Utilisateur |
| `product_id` | `UUID` | FK → PRODUCT, NOT NULL | Produit SaaS |
| `order_id` | `UUID` | FK → ORDER, NULL | Commande d'origine |
| `status` | `ENUM(...)` | NOT NULL, DEFAULT 'active' | Statut |
| `billing_period` | `ENUM('monthly', 'yearly')` | NOT NULL | Période de facturation |
| `price` | `DECIMAL(10,2)` | NOT NULL | Prix de l'abonnement |
| `currency` | `VARCHAR(3)` | DEFAULT 'EUR' | Devise |
| `stripe_subscription_id` | `VARCHAR(255)` | NOT NULL, UNIQUE | ID Subscription Stripe |
| `stripe_price_id` | `VARCHAR(255)` | NOT NULL | ID Price Stripe |
| `current_period_start` | `TIMESTAMP` | NOT NULL | Début période courante |
| `current_period_end` | `TIMESTAMP` | NOT NULL | Fin période courante |
| `cancel_at_period_end` | `BOOLEAN` | DEFAULT false | Annuler à la fin de période |
| `cancelled_at` | `TIMESTAMP` | NULL | Date d'annulation |
| `ended_at` | `TIMESTAMP` | NULL | Date de fin |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |
| `updated_at` | `TIMESTAMP` | ON UPDATE | Date de modification |

**Statuts (`status`):**
```
active           → Actif
past_due         → Paiement en retard
cancelled        → Annulé
unpaid           → Impayé
paused           → En pause
```

**Index:**
- `idx_subscription_user` ON `user_id`
- `idx_subscription_product` ON `product_id`
- `idx_subscription_stripe` ON `stripe_subscription_id`
- `idx_subscription_status` ON `status`

**Relations:**
- `SUBSCRIPTION (N) ←→ (1) USER`
- `SUBSCRIPTION (N) ←→ (1) PRODUCT`
- `SUBSCRIPTION (N) ←→ (1) ORDER`

---

### 13. CART (Panier)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `user_id` | `UUID` | FK → USER, NULL, UNIQUE | Utilisateur (NULL si guest) |
| `session_id` | `VARCHAR(255)` | NULL, UNIQUE | Session ID (guest) |
| `expires_at` | `TIMESTAMP` | NULL | Expiration (guest, 7 jours) |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |
| `updated_at` | `TIMESTAMP` | ON UPDATE | Date de modification |

**Règles:**
- Si `user_id` NOT NULL → panier utilisateur connecté
- Si `session_id` NOT NULL → panier invité (expire après 7 jours)
- Fusion du panier guest → user à la connexion

**Index:**
- `idx_cart_user` ON `user_id`
- `idx_cart_session` ON `session_id`

**Relations:**
- `CART (1) ←→ (1) USER`
- `CART (1) ←→ (N) CART_ITEM`
- `CART (1) ←→ (N) STOCK_RESERVATION`

---

### 14. CART_ITEM (Article du panier)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `cart_id` | `UUID` | FK → CART, NOT NULL | Panier |
| `product_id` | `UUID` | FK → PRODUCT, NOT NULL | Produit |
| `quantity` | `INTEGER` | NOT NULL, DEFAULT 1 | Quantité |
| `billing_period` | `ENUM('monthly', 'yearly', 'one_time')` | NOT NULL | Période |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date d'ajout |
| `updated_at` | `TIMESTAMP` | ON UPDATE | Date de modification |

**Contrainte:**
- UNIQUE (`cart_id`, `product_id`, `billing_period`)

**Index:**
- `idx_cart_item_cart` ON `cart_id`
- `idx_cart_item_product` ON `product_id`

---

### 15. CONTACT_MESSAGE (Message de contact)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `name` | `VARCHAR(200)` | NOT NULL | Nom |
| `email` | `VARCHAR(255)` | NOT NULL | Email |
| `subject` | `VARCHAR(300)` | NOT NULL | Sujet |
| `message` | `TEXT` | NOT NULL | Message |
| `is_read` | `BOOLEAN` | DEFAULT false | Lu |
| `is_processed` | `BOOLEAN` | DEFAULT false | Traité |
| `processed_by` | `UUID` | FK → ADMIN, NULL | Traité par |
| `processed_at` | `TIMESTAMP` | NULL | Date de traitement |
| `notes` | `TEXT` | NULL | Notes internes |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |

**Index:**
- `idx_contact_read` ON `is_read`
- `idx_contact_created` ON `created_at`

---

### 16. PASSWORD_RESET_TOKEN (Token réinitialisation MDP)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `user_id` | `UUID` | FK → USER, NOT NULL | Utilisateur |
| `token` | `VARCHAR(255)` | UNIQUE, NOT NULL | Token hashé |
| `expires_at` | `TIMESTAMP` | NOT NULL | Date d'expiration (1h) |
| `used_at` | `TIMESTAMP` | NULL | Date d'utilisation |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |

**Flow:**
1. User demande reset → génération token → stocké hashé ici
2. Email envoyé avec lien contenant token en clair
3. User clique → vérification token → nouveau MDP
4. Token marqué comme utilisé ou expire après 1h

**Index:**
- `idx_reset_token` ON `token`
- `idx_reset_user` ON `user_id`

---

### 17. EMAIL_VERIFICATION_TOKEN (Token vérification email)

| Colonne | Type | Contraintes | Description |
|---------|------|-------------|-------------|
| `id` | `UUID` | PK, auto-generated | Identifiant unique |
| `user_id` | `UUID` | FK → USER, NOT NULL | Utilisateur |
| `token` | `VARCHAR(255)` | UNIQUE, NOT NULL | Token hashé |
| `expires_at` | `TIMESTAMP` | NOT NULL | Date d'expiration (24h) |
| `verified_at` | `TIMESTAMP` | NULL | Date de vérification |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | Date de création |

**Flow:**
1. User s'inscrit → génération token → stocké hashé ici
2. Email envoyé avec lien de vérification
3. User clique → `is_verified = true` sur USER
4. Token expire après 24h

**Index:**
- `idx_verify_token` ON `token`
- `idx_verify_user` ON `user_id`

---

## 🔗 Diagramme des relations

```
USER (1) ────────< (N) ADDRESS
USER (1) ────────< (N) ORDER
USER (1) ────────< (N) SUBSCRIPTION
USER (1) ────────< (1) CART
USER (1) ────────< (N) STOCK_RESERVATION
USER (1) ────────< (N) PASSWORD_RESET_TOKEN
USER (1) ────────< (N) EMAIL_VERIFICATION_TOKEN

ADMIN (1) ───────< (N) ADMIN_2FA_CODE
ADMIN (1) ───────< (N) CONTACT_MESSAGE (processed_by)

CATEGORY (1) ────< (N) PRODUCT

PRODUCT (1) ─────< (N) PRODUCT_IMAGE
PRODUCT (1) ─────< (N) PRODUCT_CHARACTERISTIC
PRODUCT (1) ─────< (N) STOCK_RESERVATION
PRODUCT (1) ─────< (N) ORDER_ITEM
PRODUCT (1) ─────< (N) SUBSCRIPTION
PRODUCT (1) ─────< (N) CART_ITEM

ORDER (1) ───────< (N) ORDER_ITEM

CART (1) ────────< (N) CART_ITEM
CART (1) ────────< (N) STOCK_RESERVATION
```

---

## 📝 Enums TypeScript

```typescript
// src/common/enums/product-type.enum.ts
export enum ProductType {
  SAAS = 'saas',
  DIGITAL = 'digital',
  PHYSICAL = 'physical',
}

// src/common/enums/billing-period.enum.ts
export enum BillingPeriod {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  ONE_TIME = 'one_time',
}

// src/common/enums/order-status.enum.ts
export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

// src/common/enums/order-type.enum.ts
export enum OrderType {
  SAAS = 'saas',
  DIGITAL = 'digital',
  PHYSICAL = 'physical',
  MIXED = 'mixed',
}

// src/common/enums/subscription-status.enum.ts
export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  UNPAID = 'unpaid',
  PAUSED = 'paused',
}

// src/common/enums/admin-role.enum.ts
export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  COMMERCIAL = 'commercial',
}

// src/common/enums/language.enum.ts
export enum Language {
  FR = 'fr',
  EN = 'en',
}
```

---

## 🔒 Règles métier intégrées

| Règle | Implementation |
|-------|----------------|
| **SaaS = abonnement** | `price_monthly` et/ou `price_yearly` requis, pas de stock |
| **Digital = achat unique** | `price_unit` requis, pas de stock, pas de livraison |
| **Physical = achat + livraison** | `price_unit` requis, `stock_quantity` requis |
| **Réservation stock** | Produits `physical` réservés 15 min pendant checkout |
| **Stock disponible** | `stock_quantity` - réservations actives non expirées |
| **Commande mixte** | `order_type = 'mixed'` si contient plusieurs types |
| **Snapshot produit** | `product_snapshot` JSONB pour historique prix |
| **Adresse livraison** | Requise uniquement si commande contient `physical` |
| **Guest checkout** | `user_id` NULL, `guest_email` NOT NULL |
| **Une image principale** | Un seul `is_primary = true` par produit |
| **2FA Admin** | Code 6 chiffres, expire 5 min, envoyé par email |
| **Rôles Admin** | `super_admin` = accès complet, `commercial` = analytics uniquement |

---

## 🔄 Cron Jobs requis

| Job | Fréquence | Action |
|-----|-----------|--------|
| **cleanup_expired_reservations** | Toutes les minutes | `DELETE FROM stock_reservations WHERE expires_at < NOW() AND confirmed_at IS NULL` |
| **cleanup_expired_guest_carts** | Toutes les heures | `DELETE FROM cart WHERE session_id IS NOT NULL AND expires_at < NOW()` |
| **cleanup_expired_2fa_codes** | Toutes les 5 min | `DELETE FROM admin_2fa_code WHERE expires_at < NOW() AND used_at IS NULL` |
| **cleanup_expired_reset_tokens** | Toutes les heures | `DELETE FROM password_reset_token WHERE expires_at < NOW() AND used_at IS NULL` |
| **cleanup_expired_verify_tokens** | Toutes les heures | `DELETE FROM email_verification_token WHERE expires_at < NOW() AND verified_at IS NULL` |

---

## 📊 Données initiales (Seed)

### Catégories
```sql
INSERT INTO category (id, slug, name_fr, name_en, display_order) VALUES
  (gen_random_uuid(), 'services', 'Services', 'Services', 1),
  (gen_random_uuid(), 'produits', 'Produits', 'Products', 2);
```

### Produits SaaS
```sql
-- SOC Premium
INSERT INTO product (
  slug, sku, name_fr, name_en, description_fr, description_en,
  product_type, price_monthly, price_yearly, category_id
) VALUES (
  'soc-premium', 'SOC-001',
  'SOC Premium', 'SOC Premium',
  'Notre solution SOC Premium offre une surveillance continue 24/7 de votre infrastructure.',
  'Our SOC Premium solution provides 24/7 continuous monitoring of your infrastructure.',
  'saas', 299.00, 2990.00, (SELECT id FROM category WHERE slug = 'services')
);

-- EDR Advanced  
INSERT INTO product (
  slug, sku, name_fr, name_en, description_fr, description_en,
  product_type, price_monthly, price_yearly, category_id
) VALUES (
  'edr-advanced', 'EDR-001',
  'EDR Advanced', 'EDR Advanced',
  'Protection et surveillance avancée des terminaux avec détection comportementale.',
  'Advanced endpoint protection and monitoring with behavioral detection.',
  'saas', 199.00, 1990.00, (SELECT id FROM category WHERE slug = 'services')
);

-- XDR Enterprise
INSERT INTO product (
  slug, sku, name_fr, name_en, description_fr, description_en,
  product_type, price_monthly, price_yearly, category_id
) VALUES (
  'xdr-enterprise', 'XDR-001',
  'XDR Enterprise', 'XDR Enterprise',
  'Solution de détection et réponse étendue combinant EDR et corrélation des menaces.',
  'Extended detection and response solution combining EDR and threat correlation.',
  'saas', 499.00, 4990.00, (SELECT id FROM category WHERE slug = 'services')
);
```

### Admin par défaut
```sql
-- Mot de passe: Admin123! (à changer en production)
INSERT INTO admin (id, email, password_hash, first_name, last_name, role) VALUES (
  gen_random_uuid(),
  'admin@cyna.fr',
  '$2b$10$...', -- bcrypt hash
  'Admin',
  'Cyna',
  'super_admin'
);
```

---

## ✅ Checklist Claude Code

Quand tu génères des entités TypeORM :

- [ ] Utiliser `@PrimaryGeneratedColumn('uuid')` pour les IDs
- [ ] Ajouter `@CreateDateColumn()` et `@UpdateDateColumn()`
- [ ] Utiliser `@Column({ type: 'enum', enum: ... })` pour les enums
- [ ] Ajouter `@Index()` sur les colonnes fréquemment requêtées
- [ ] Utiliser `@Column({ type: 'jsonb' })` pour les snapshots
- [ ] Ajouter les relations avec `@ManyToOne`, `@OneToMany`, etc.
- [ ] Définir `onDelete: 'CASCADE'` ou `'SET NULL'` selon les cas
- [ ] Valider avec `class-validator` dans les DTOs
- [ ] Nommer les fichiers en kebab-case (ex: `order-item.entity.ts`)
- [ ] Exporter depuis un fichier `index.ts` par module

---

## 📋 Changelog

### v1.4 (21 janvier 2026)
- ✨ Ajout de l'entité `STOCK_RESERVATION` (entité #9)
- 🔄 Mise à jour des relations PRODUCT, CART, USER
- 📝 Ajout de la section "Cron Jobs requis"
- 📝 Ajout de la règle métier "Réservation stock"
- 📝 Passage de 16 à 17 entités

### v1.3 (20 janvier 2026)
- Suppression USER.phone et PRODUCT.currency

### v1.2
- Ajout des tokens (PASSWORD_RESET_TOKEN, EMAIL_VERIFICATION_TOKEN)

### v1.1
- Ajout ADMIN_2FA_CODE

### v1.0
- Version initiale
