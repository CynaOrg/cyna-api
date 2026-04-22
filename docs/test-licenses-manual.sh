#!/usr/bin/env bash
#
# Manual end-to-end curl test for the licenses feature.
# Requires: cyna-api running (npm run start:all), jq, docker (for DB insert).
#
# Usage:
#   ./docs/test-licenses-manual.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000/api/v1}"
EMAIL="curl-test-$(date +%s)@test.cyna"
PASSWORD="Test1234!"
COOKIES_FILE=$(mktemp)
trap "rm -f $COOKIES_FILE" EXIT

banner() { printf "\n\033[1;36m=== %s ===\033[0m\n" "$1"; }
ok()     { printf "\033[1;32m[OK]\033[0m %s\n" "$1"; }
fail()   { printf "\033[1;31m[FAIL]\033[0m %s\n" "$1"; exit 1; }

banner "1. Register test user"
curl -sf -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"firstName\":\"Test\",\"lastName\":\"User\"}" \
  | jq .

banner "2. Login and store cookie"
curl -sf -c "$COOKIES_FILE" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | jq .

USER_ID=$(curl -sf -b "$COOKIES_FILE" "$BASE_URL/profile" | jq -r '.data.id // .id')
if [ -z "$USER_ID" ] || [ "$USER_ID" = "null" ]; then
  fail "Could not extract user id from /profile"
fi
ok "User ID: $USER_ID"

banner "3. Insert fake license directly in DB (webhook wiring not in scope)"
docker exec cyna-postgres psql -U cyna -d cyna_db -c "
INSERT INTO license_keys
  (id, order_id, product_id, user_id, license_key, email, product_snapshot, status, activated_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '$USER_ID',
   'CYNA-MANU-TEST-CURL-0001', '$EMAIL',
   '{\"nameFr\":\"EDR Manuel\",\"nameEn\":\"Manual EDR\",\"slug\":\"edr-manual\"}'::jsonb,
   'active', NOW(), NOW(), NOW())"

banner "4. GET /licenses (should return 1 license)"
curl -sf -b "$COOKIES_FILE" "$BASE_URL/licenses" | jq .

banner "5. GET /licenses/:id (pick first)"
LICENSE_ID=$(curl -sf -b "$COOKIES_FILE" "$BASE_URL/licenses" | jq -r '.data[0].id // .[0].id')
if [ -z "$LICENSE_ID" ] || [ "$LICENSE_ID" = "null" ]; then
  fail "Could not extract license id"
fi
curl -sf -b "$COOKIES_FILE" "$BASE_URL/licenses/$LICENSE_ID" | jq .
ok "License detail fetched: $LICENSE_ID"

banner "6. Malformed UUID should be 400"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIES_FILE" "$BASE_URL/licenses/not-a-uuid")
[ "$CODE" = "400" ] && ok "Got 400" || fail "Expected 400, got $CODE"

banner "7. Without cookie should be 401"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/licenses")
[ "$CODE" = "401" ] && ok "Got 401" || fail "Expected 401, got $CODE"

banner "8. Non-existent UUID should be 404 (not 200)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIES_FILE" \
  "$BASE_URL/licenses/00000000-0000-0000-0000-000000000000")
[ "$CODE" = "404" ] && ok "Got 404" || fail "Expected 404, got $CODE"

banner "9. Delete account (triggers ACCOUNT_DELETED event)"
curl -sf -b "$COOKIES_FILE" -X POST "$BASE_URL/profile/delete" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$PASSWORD\"}" \
  | jq .

# Give the event a moment to propagate through RMQ
sleep 2

banner "10. Verify license is now revoked"
STATUS=$(docker exec cyna-postgres psql -U cyna -d cyna_db -tAc \
  "SELECT status FROM license_keys WHERE user_id='$USER_ID' LIMIT 1")
if [ "$STATUS" = "revoked" ]; then
  ok "License revoked after account deletion"
else
  fail "Expected 'revoked', got '$STATUS'"
fi

banner "ALL CHECKS PASSED"
