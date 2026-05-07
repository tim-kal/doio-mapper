#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
meta="$repo_root/definitions/kb16b-02-wireless-via.json"
out="${1:-$repo_root/layouts/current.local.json}"

mkdir -p "$(dirname "$out")"
vitaly save -m "$meta" -f "$out"
node -e "const fs=require('fs'); const p=process.argv[1]; const fix=(v)=>Array.isArray(v)?v.map(fix):(v&&typeof v==='object')?Object.fromEntries(Object.entries(v).map(([k,val])=>[k,fix(val)])):v==='LM(0,KC_NO)'?'KC_NO':v; const j=fix(JSON.parse(fs.readFileSync(p,'utf8'))); fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');" "$out"
