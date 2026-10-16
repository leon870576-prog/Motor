#!/bin/sh
set -eu
if [ "$#" -ne 1 ] || [ ! -d "$1" ]; then
    echo 'Usage: sh apply-code-update.sh EXISTING_TARGET_DIRECTORY' >&2
    exit 1
fi
target=$(cd "$1" && pwd -P)
cd "$(dirname "$0")"
sha256sum -c CODE_UPDATE_SHA256
avatar_tmp=$(mktemp -d)
trap 'rm -rf "$avatar_tmp"' EXIT HUP INT TERM
mkdir -p "$avatar_tmp/images/avators" "$avatar_tmp/images/avators2"
for collection in avators avators2; do
    if [ -L "$target/images" ] || [ -L "$target/images/$collection" ]; then
        echo 'Refusing a symlink image destination' >&2
        exit 1
    fi
    for source in "avatar-artwork/$collection/"*.gif.base64; do
        name=${source##*/}
        name=${name%.base64}
        number=${name%.gif}
        case "$number" in
            guest|noavatar) ;;
            ''|*[!0-9]*) echo 'Unexpected avatar filename' >&2; exit 1 ;;
        esac
        base64 -d "$source" > "$avatar_tmp/images/$collection/$name"
    done
done
cp avatar-artwork/SHA256SUMS "$avatar_tmp/SHA256SUMS"
(cd "$avatar_tmp" && sha256sum -c SHA256SUMS)
cp -R code-update/. "$target/"
mkdir -p "$target/images"
cp -R "$avatar_tmp/images/." "$target/images/"
echo 'Code update and 402 original avatar filenames verified and installed.'
