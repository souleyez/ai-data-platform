#!/usr/bin/env bash
set -euo pipefail

NFT_MAIN_CONF="${NFT_MAIN_CONF:-/etc/sysconfig/nftables.conf}"
NFT_INCLUDE_DIR="${NFT_INCLUDE_DIR:-/etc/nftables.d}"
NFT_INCLUDE_FILE="${NFT_INCLUDE_FILE:-$NFT_INCLUDE_DIR/ai-data-platform-guard.nft}"
PORTS="${PORTS:-3001,3002,3100,3210}"

mkdir -p "$NFT_INCLUDE_DIR"

if [[ ! -f "$NFT_MAIN_CONF" ]]; then
  cat >"$NFT_MAIN_CONF" <<'EOF'
# Load optional service-specific snippets from /etc/nftables.d.
include "/etc/nftables.d/*.nft"
EOF
fi

if ! grep -Fq 'include "/etc/nftables.d/*.nft"' "$NFT_MAIN_CONF"; then
  printf '\ninclude "/etc/nftables.d/*.nft"\n' >>"$NFT_MAIN_CONF"
fi

cat >"$NFT_INCLUDE_FILE" <<EOF
table inet ai_data_platform_guard {
    chain input {
        type filter hook input priority -5; policy accept;
        iifname "lo" accept
        tcp dport { ${PORTS} } reject with tcp reset
    }
}
EOF

systemctl enable nftables.service
systemctl restart nftables.service
systemctl is-active nftables.service
nft list ruleset
