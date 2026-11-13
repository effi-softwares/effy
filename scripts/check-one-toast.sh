#!/usr/bin/env bash
# One toast for every web surface (feature 120): Effy's own, in @effy/design-system/toast. This fails when an outside
# toast product comes back, or an app grows a second toast of its own.
#
# What it looks for, in apps/ and packages/ (never node_modules):
#   - an import or require of `sonner`
#   - a `"sonner"` dependency in a package.json
#   - a file named toast-store* (the storefront's old home-made toast)
#   - a file whose name says Toast that carries its own role="status" region outside the design system
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
src_dirs=(apps packages)
exclude=(--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude-dir=.turbo)

hits=$(grep -rnE "from ['\"]sonner['\"]|require\(['\"]sonner['\"]\)|import\(['\"]sonner['\"]\)" "${src_dirs[@]}" "${exclude[@]}" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.cjs' 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "✗ sonner is imported. Toasts come from @effy/design-system/toast (120):"
  echo "$hits"
  fail=1
fi

deps=$(grep -rln --include=package.json '"sonner"' "${src_dirs[@]}" "${exclude[@]}" 2>/dev/null || true)
if [ -n "$deps" ]; then
  echo "✗ a package depends on sonner (120):"
  echo "$deps"
  fail=1
fi

stores=$(find "${src_dirs[@]}" -path '*/node_modules' -prune -o -path '*/.next' -prune -o -name 'toast-store*' -print 2>/dev/null || true)
if [ -n "$stores" ]; then
  echo "✗ a second toast store exists. Use @effy/design-system/toast (120):"
  echo "$stores"
  fail=1
fi

regions=$(find apps -path '*/node_modules' -prune -o -path '*/.next' -prune -o -iname '*toast*.tsx' -print 2>/dev/null \
  | xargs grep -lE 'role="status"' 2>/dev/null | grep -vE '\.test\.tsx$' || true)
if [ -n "$regions" ]; then
  echo "✗ an app draws its own toast region. The Toaster from @effy/design-system/toast is the only one (120):"
  echo "$regions"
  fail=1
fi

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "check-one-toast: OK - one toast (@effy/design-system/toast) for every web surface"
