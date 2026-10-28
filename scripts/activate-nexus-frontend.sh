#!/usr/bin/env bash
# Scope: static frontend only. Does not read secrets, reload nginx or touch containers.
set -euo pipefail
release_id=${1:?release id required}
expected_archive_hash=${2:?archive hash required}
[[ "$release_id" =~ ^nexus-[0-9]{8}-[a-f0-9]{7,40}$ ]] || exit 64
[[ "$expected_archive_hash" =~ ^[a-f0-9]{64}$ ]] || exit 64
root=/opt/zica-ia-posts/frontend
target=app.zica.posts.zicajuris.com.br
archive="/tmp/zica-posts-$release_id.tgz"
release="$root/releases/$release_id"
backup="/opt/zica-ia-posts/backups/$release_id"
exec 9>"$root/.nexus-release.lock"
flock -n 9 || { echo 'Another frontend deployment is running'; exit 75; }
test "$(id -un)" = deploy_zica_ia_posts
old=$(readlink -f "$root/current")
[[ "$old" == "$root/releases/"* ]] && test -f "$old/index.html"
test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected_archive_hash"
test ! -e "$release"
umask 077
mkdir -p "$backup"
tar -czf "$backup/frontend-before.tgz" -C "$old" .
printf '%s\n' "$old" > "$backup/previous-release.txt"
# Package is created from our tested dist. Reject absolute/traversal paths.
if tar -tzf "$archive" | grep -E '(^/|(^|/)\.\.(/|$))'; then exit 65; fi
mkdir "$release"
tar -xzf "$archive" -C "$release" --no-same-owner
test -f "$release/index.html"
# Preserve hashed assets used by browser tabs opened before this deployment.
if test -d "$old/assets"; then cp -an "$old/assets/." "$release/assets/"; fi
chmod -R a+rX "$release"
rollback() {
  ln -s "$old" "$root/.rollback-$release_id"
  mv -Tf "$root/.rollback-$release_id" "$root/current"
  echo 'Frontend restored to previous release' >&2
}
trap rollback ERR
ln -s "$release" "$root/.next-$release_id"
mv -Tf "$root/.next-$release_id" "$root/current"
expected_index=$(sha256sum "$release/index.html" | cut -d' ' -f1)
actual_index=$(curl -fsS --max-time 25 "https://$target/" | sha256sum | cut -d' ' -f1)
test "$expected_index" = "$actual_index"
trap - ERR
printf 'active=%s\nbackup=%s\nindex_sha256=%s\n' "$release" "$backup" "$expected_index"
