#!/usr/bin/env bash
# Run a Shopify Admin GraphQL request with the owner's "Athletic Sask" app.
# Exchanges CLIENT_ID / CLIENT_SECRET (environment variables) for a 24h token,
# cached in ~/.cache/ah_shopify_token (mode 600) and refreshed automatically.
# Usage:  tools/shopify_admin.sh '{ shop { name } }'            (query)
#         tools/shopify_admin.sh @request.json                   (full JSON body {"query":..,"variables":..})
# Never print the token or secret.
set -euo pipefail
SHOP="sfypqe-qu.myshopify.com"; API="2026-10"
CACHE="${HOME}/.cache/ah_shopify_token"; mkdir -p "$(dirname "$CACHE")"
: "${CLIENT_ID:?CLIENT_ID not set}"; : "${CLIENT_SECRET:?CLIENT_SECRET not set}"
fresh() { [ -s "$CACHE" ] && [ $(( $(date +%s) - $(stat -c %Y "$CACHE") )) -lt 72000 ]; }
if ! fresh; then
  umask 077
  curl -sS -X POST "https://$SHOP/admin/oauth/access_token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode grant_type=client_credentials \
    --data-urlencode "client_id=$CLIENT_ID" --data-urlencode "client_secret=$CLIENT_SECRET" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);t=d.get("access_token");sys.exit("token exchange failed: "+str(d.get("error",d))) if not t else print(t,end="")' > "$CACHE.tmp"
  mv "$CACHE.tmp" "$CACHE"
fi
if [[ "${1:-}" == @* ]]; then BODY=$(cat "${1#@}")
else BODY=$(python3 -c 'import sys,json;print(json.dumps({"query":sys.argv[1]}))' "${1:?query required}"); fi
curl -sS "https://$SHOP/admin/api/$API/graphql.json" \
  -H "X-Shopify-Access-Token: $(cat "$CACHE")" -H 'Content-Type: application/json' --data-binary "$BODY"
echo
