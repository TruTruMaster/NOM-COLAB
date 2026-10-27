#!/bin/sh
# check-config.sh <.config> <fragment>...   (run from the kernel source tree)
# Lists every option a fragment asked for that the final .config does not have:
# Kconfig silently drops options whose dependencies are missing. Options that
# do not exist at all in this kernel version are only reported, not counted.
# When several fragments set the same option, the last one wins, as in merge_config.sh.
# Exit status: number of options that exist here but did not apply (0 = all good).
cfg="$1"; shift
[ -f "$cfg" ] || { echo "usage: $0 .config fragment..." >&2; exit 100; }

known=$(mktemp)
find . -name 'Kconfig*' -not -path './Documentation/*' -exec cat {} + 2>/dev/null \
  | sed -n 's/^[[:space:]]*\(menu\)\{0,1\}config[[:space:]]\{1,\}\([A-Za-z0-9_]*\).*/CONFIG_\2/p' | sort -u > "$known"

cat "$@" | awk -v cfg="$cfg" -v known="$known" '
  /^CONFIG_[A-Za-z0-9_]+=/ { s = $0; sub(/=.*/, "", s); v = $0; sub(/^[^=]*=/, "", v); want[s] = v; order[++n] = s; next }
  /^# CONFIG_[A-Za-z0-9_]+ is not set/ { s = $2; want[s] = "n"; order[++n] = s; next }
  END {
    while ((getline line < known) > 0) exists[line] = 1
    while ((getline line < cfg) > 0) {
      if (line ~ /^CONFIG_/) { s = line; sub(/=.*/, "", s); have[s] = substr(line, length(s) + 2) }
    }
    bad = 0; gone = 0
    for (i = 1; i <= n; i++) {
      s = order[i]
      if (s in seen) continue
      seen[s] = 1
      h = (s in have) ? have[s] : "n"
      if (h == want[s]) continue
      if (!(s in exists)) { printf "  %-40s not in this kernel version (ignored)\n", s; gone++; continue }
      printf "  %-40s wanted %-12s got %s\n", s, want[s], h; bad++
    }
    if (bad == 0) printf "check-config: all requested options are set%s\n", gone ? " (" gone " not in this version)" : ""
    else printf "check-config: %d option(s) did not apply (missing dependency or renamed)\n", bad
    exit (bad > 99 ? 99 : bad)
  }'
rc=$?
rm -f "$known"
exit $rc
