#!/bin/sh
# check-config.sh <.config> <fragment>...
# Lists every option a fragment asked for that the final .config does not have
# (Kconfig silently drops options whose dependencies are missing).
# When several fragments set the same option, the last one wins, as in merge_config.sh.
# Exit status: number of mismatches (0 = everything applied).
cfg="$1"; shift
[ -f "$cfg" ] || { echo "usage: $0 .config fragment..." >&2; exit 100; }

cat "$@" | awk -v cfg="$cfg" '
  function want_of(line,   m) {
    if (match(line, /^CONFIG_[A-Za-z0-9_]+=/)) return substr(line, RLENGTH + 1)
    return "n"
  }
  /^CONFIG_[A-Za-z0-9_]+=/ { s = $0; sub(/=.*/, "", s); want[s] = want_of($0); order[++n] = s; next }
  /^# CONFIG_[A-Za-z0-9_]+ is not set/ { s = $2; want[s] = "n"; order[++n] = s; next }
  END {
    while ((getline line < cfg) > 0) {
      if (line ~ /^CONFIG_/) { s = line; sub(/=.*/, "", s); have[s] = substr(line, length(s) + 2) }
    }
    bad = 0
    for (i = 1; i <= n; i++) {
      s = order[i]
      if (s in seen) continue
      seen[s] = 1
      h = (s in have) ? have[s] : "n"
      if (h != want[s]) { printf "  %-40s wanted %-12s got %s\n", s, want[s], h; bad++ }
    }
    if (bad == 0) print "check-config: all requested options are set"
    else printf "check-config: %d option(s) did not apply (missing dependency or renamed)\n", bad
    exit (bad > 99 ? 99 : bad)
  }'
