#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
meta="$repo_root/definitions/kb16b-02-wireless-via.json"

exec vitaly "$@" -m "$meta"

