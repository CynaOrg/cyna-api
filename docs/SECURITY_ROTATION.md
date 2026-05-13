# Procédure de rotation des secrets — CYNA

> Document opérationnel pour la rotation des secrets avant mise en production.
> Audit pré-prod du 2026-05-13 (cf. `docs/AUDIT_PRE_PROD_2026-05-13.md`) a identifié des secrets exposés dans `cyna-api/.env`. Cette procédure documente leur remplacement.

## État vérifié au 2026-05-13

| Secret                                       | Localisation                 | Compromis ?                     | Action                 |
| -------------------------------------------- | ---------------------------- | ------------------------------- | ---------------------- |
| `.env` (cyna-api)                            | disque local + équipe        | ⚠️ partagé en équipe            | Rotation prudente      |
| Historique Git de `.env`                     | `git log --all -- .env`      | ✅ **JAMAIS commité** (vérifié) | Aucune remédiation git |
| `.env.example`                               | `cyna-api/.env.example`      | ✅ placeholders uniquement      | RAS                    |
| Stripe `pk_test_` dans `environment.prod.ts` | `cyna-app/src/environments/` | ⚠️ committable mais clé test    | Voir CRIT-5            |

## Secrets à rotater avant go-live prod

### 1. SMTP password OVH (CRITIQUE)

**Compte concerné** : `noreply@cyna.it` (OVH)
**Risque** : compte mail compromis pouvant servir de relais spam/phishing.

**Procédure** :

1. Se connecter à l'espace client OVH → Hébergements & Web → Emails
2. Sélectionner `noreply@cyna.it`
3. Onglet "Mot de passe" → générer un nouveau mot de passe fort (32+ caractères)
4. Mettre à jour la variable Railway : `SMTP_PASSWORD` dans le service `notification-service`
5. Tester un envoi de mail (par exemple via le flow d'inscription en staging)
6. Conserver l'ancien mot de passe SEULEMENT le temps de valider le nouveau (max 1h)
7. Mettre à jour le `.env` local de chaque dev (Slack équipe avec le nouveau dans un canal privé éphémère, ou 1Password partagé)

### 2. Stripe webhook secret (CRITIQUE)

**Risque** : forge de webhooks Stripe possible → faux paiements.

**Procédure** :

1. Stripe Dashboard → Developers → Webhooks
2. Sélectionner l'endpoint `https://api.cyna.it/webhooks/stripe`
3. Cliquer "Roll secret" (rotation Stripe-side avec période de grâce 24h)
4. Copier le nouveau `whsec_*`
5. Mettre à jour Railway : `STRIPE_WEBHOOK_SECRET` dans `payment-service`
6. Déployer
7. Vérifier dans Stripe Dashboard que les events sont à nouveau marqués "delivered"
8. Après confirmation (≤24h), Stripe désactive automatiquement l'ancien secret

### 3. Stripe live keys (CRITIQUE pour go-live)

**Aujourd'hui** : `sk_test_*` et `pk_test_*` (Stripe Test Mode).
**Pour la prod** : il faut basculer en `pk_live_*` / `sk_live_*`.

**Procédure** :

1. Stripe Dashboard → toggle "Test mode" → OFF (vue Live mode)
2. Developers → API keys → révéler `sk_live_*` (créer si absent)
3. Mettre à jour Railway en production :
   - `STRIPE_SECRET_KEY=sk_live_*` dans `payment-service`
   - `STRIPE_PUBLISHABLE_KEY=pk_live_*` (injecté au build cyna-app, cf. CRIT-5)
4. Recréer un webhook endpoint en Live mode pour `https://api.cyna.it/webhooks/stripe`
5. Récupérer le nouveau `whsec_*` Live et l'injecter en Railway
6. Tester avec une vraie carte (1€ remboursé) pour valider le flow complet

### 4. JWT_SECRET (CRITIQUE)

**Risque** : forge de tokens utilisateur ou admin si le secret par défaut `change-me-in-production-minimum-32-characters!!` est resté en prod.

**Procédure** :

1. Générer un nouveau secret robuste :
   ```bash
   openssl rand -hex 32
   # ou
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Mettre à jour Railway : `JWT_SECRET` dans `auth-service` ET dans `api-gateway` (les deux doivent partager le même secret)
3. Déployer — **conséquence : tous les utilisateurs et admins sont déconnectés** (tokens existants invalidés)
4. Communiquer en amont aux clients connectés (bannière "Maintenance de sécurité, reconnexion requise")

### 5. RabbitMQ credentials prod (HIGH)

**Aujourd'hui** : `amqp://guest:guest@localhost:5672` (par défaut, à risque si exposé).
**Pour la prod** : Railway fournit son propre `RABBITMQ_URL` avec credentials uniques.

**Procédure** :

1. Vérifier dans Railway que `RABBITMQ_URL` est fourni par le service RabbitMQ managé
2. Confirmer que la chaîne ne contient pas `guest:guest` :
   ```bash
   # Doit retourner une chaîne du type amqp://USER:STRONG_PASSWORD@HOST:5672
   railway variables --service api-gateway | grep RABBITMQ_URL
   ```
3. Si présent par défaut, créer un user dédié dans la console RabbitMQ Railway avec permissions limitées au vhost projet

### 6. Database password (MED)

**Aujourd'hui** : `cyna_dev` (dev seulement).
**Pour la prod** : Railway fournit son propre `DATABASE_URL` avec password fort généré.

**Procédure** : vérifier `DATABASE_PASSWORD` Railway n'est pas `cyna_dev`. Si oui, regenerate.

## Variables Railway à configurer en prod (checklist)

À configurer dans chaque service Railway concerné :

| Variable                 | Service                    | Note                                                                             |
| ------------------------ | -------------------------- | -------------------------------------------------------------------------------- |
| `NODE_ENV`               | tous                       | `production`                                                                     |
| `DATABASE_SYNC`          | tous                       | **OBLIGATOIRE `false`** (la garde NODE_ENV bloque déjà, mais ceinture+bretelles) |
| `DATABASE_LOGGING`       | tous                       | `false` (sinon fuite SQL dans les logs Railway)                                  |
| `SWAGGER_ENABLED`        | api-gateway                | `false` (sinon `/docs` exposé)                                                   |
| `JWT_SECRET`             | api-gateway + auth-service | 64+ caractères, `openssl rand -hex 32`                                           |
| `STRIPE_SECRET_KEY`      | payment-service            | `sk_live_*`                                                                      |
| `STRIPE_WEBHOOK_SECRET`  | payment-service            | `whsec_*` Live                                                                   |
| `STRIPE_PUBLISHABLE_KEY` | cyna-app build             | `pk_live_*` injecté au build                                                     |
| `SMTP_PASSWORD`          | notification-service       | nouveau password OVH                                                             |
| `COOKIE_DOMAIN`          | api-gateway                | `.cyna.it`                                                                       |
| `CORS_ORIGINS`           | api-gateway                | `https://app.cyna.it,https://admin.cyna.it,capacitor://localhost` uniquement     |
| `RABBITMQ_URL`           | tous                       | amqp Railway avec credentials dédiés                                             |
| `ADMIN_SEED_ENABLED`     | auth-service               | `false` après premier boot                                                       |

## Vérifications post-rotation

```bash
# Sur l'API en prod (curl public)
curl -I https://api.cyna.it/docs
# Attendu : 404 ou 401 (Swagger off)

curl https://api.cyna.it/health
# Attendu : 200 OK

# Logs Railway notification-service : aucun log SMTP echec après rotation
# Logs Railway payment-service : webhook Stripe delivered OK depuis Dashboard
# Logs Railway api-gateway : pas de requete avec ancien JWT (401 attendus pendant les 15min de transition)
```

## Sécurisation post go-live

- [ ] Ajouter une alerte Slack si `DATABASE_SYNC=true` est détecté en prod (impossible désormais grâce au helper `isDatabaseSyncEnabled`, mais une alerte est utile)
- [ ] Activer la 2FA OVH sur le compte admin OVH
- [ ] Restreindre les API keys Stripe Live à l'IP Railway si possible (Stripe → Developers → API keys → restrict key)
- [ ] Mettre en place 1Password (ou Doppler) en tant que coffre-fort partagé pour l'équipe — bannir les secrets dans Slack/email
- [ ] Documenter la procédure de rotation annuelle (calendrier 12 mois pour JWT_SECRET et SMTP_PASSWORD)

## Historique

| Date            | Action                                                                   | Par                                        |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| 2026-05-13      | Audit pré-prod identifie 4 secrets exposés dans `.env`                   | équipe + audit Claude                      |
| 2026-05-13      | Vérif historique git : `.env` jamais commité ✅                          | audit                                      |
| 2026-05-13      | Helper `isDatabaseSyncEnabled()` mergé, garde NODE_ENV + Railway markers | commit `security(api): gate DATABASE_SYNC` |
| 2026-05-13      | `.env.example` complété avec Stripe + cookie + admin seed placeholders   | commit CRIT-1                              |
| **à compléter** | Rotation SMTP OVH                                                        | Tom                                        |
| **à compléter** | Rotation Stripe webhook secret                                           | Tom                                        |
| **à compléter** | Migration `pk_live_*` / `sk_live_*`                                      | Tom                                        |
| **à compléter** | Rotation JWT_SECRET (force logout global)                                | Tom                                        |
