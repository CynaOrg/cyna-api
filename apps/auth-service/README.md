# Auth Service

Gère toute l'authentification (utilisateurs + admins). Microservice pur RabbitMQ, jamais exposé en HTTP — consommé uniquement par l'API Gateway.

## Rôle

- Register, login, vérification email
- JWT access token (15 min) + refresh token (7j) en cookie httpOnly
- 2FA admin obligatoire (code 6 chiffres par email, valable 5 min)
- Forgot / reset password
- Bcrypt cost 12 sur les mots de passe
- Réagit à `user.deleted` (révocation tokens) et `user.password_changed`

## Patterns RMQ

Queue : `auth_queue`

**MessagePatterns** : `auth.register_user`, `auth.validate_user`, `auth.verify_email`, `auth.resend_verification`, `auth.forgot_password`, `auth.reset_password`, `auth.refresh_token`, `auth.logout`, `auth.admin_login`, `auth.admin_verify_2fa`, `auth.admin_resend_2fa`, `auth.admin_refresh_token`, `auth.admin_logout`.

**EventPatterns reçus** : `user.deleted`, `user.password_changed`.

**EventPatterns émis** (consommés par notification-service) : `auth.user_registered`, `auth.user_verified`, `auth.password_reset_requested`, `auth.password_reset_completed`, `auth.password_changed`, `auth.admin_2fa_code_requested`.

## Stockage

- PostgreSQL : tokens, codes 2FA, refresh sessions (les données user vivent dans `user-service`)

## Variables clés

```env
JWT_SECRET=<min 32 chars>
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d
BCRYPT_SALT_ROUNDS=12
TWO_FACTOR_CODE_EXPIRY_MINUTES=5
ADMIN_SEED_ENABLED=false  # true au premier boot pour créer un super-admin
```

## Démarrage isolé

```bash
npm run start:dev:auth
```
