#!/usr/bin/env bash
# Lock CPU clocks for a consistent benchmark, then restore whatever was set
# before — even if the benchmark crashes or you Ctrl-C it.
#
# Usage:  bash scripts/bench.sh
# Override the pinned core with:  BENCH_CORE=3 bash scripts/bench.sh
set -euo pipefail

CORE="${BENCH_CORE:-2}"   # which core to pin to (avoid 0; the OS lives there)

# --- locate the turbo/boost knob (Intel vs AMD/generic use different paths) ---
if [[ -e /sys/devices/system/cpu/intel_pstate/no_turbo ]]; then
  TURBO_FILE=/sys/devices/system/cpu/intel_pstate/no_turbo
  TURBO_OFF=1; TURBO_ON=0           # intel_pstate: 1 = turbo OFF
elif [[ -e /sys/devices/system/cpu/cpufreq/boost ]]; then
  TURBO_FILE=/sys/devices/system/cpu/cpufreq/boost
  TURBO_OFF=0; TURBO_ON=1           # amd/generic: 0 = boost OFF
else
  TURBO_FILE=""                     # no controllable turbo knob found
fi

# --- remember current state so we can put it back ---
GOV_OLD=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo "")
[[ -n "$TURBO_FILE" ]] && TURBO_OLD=$(cat "$TURBO_FILE")

restore() {
  [[ -n "$GOV_OLD"    ]] && echo "$GOV_OLD"  | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor >/dev/null || true
  [[ -n "$TURBO_FILE" ]] && echo "$TURBO_OLD" | sudo tee "$TURBO_FILE" >/dev/null || true
  echo "Restored governor + turbo."
}
trap restore EXIT   # runs on normal exit, error, or Ctrl-C

# --- lock clocks: performance governor (no downscaling) + turbo off (no boost wobble) ---
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor >/dev/null
[[ -n "$TURBO_FILE" ]] && echo "$TURBO_OFF" | sudo tee "$TURBO_FILE" >/dev/null

# --- run, pinned to one core (this part is the genuinely per-process bit) ---
taskset -c "$CORE" tsx --predictable --expose-gc \
  --max-semi-space-size=128 --max-old-space-size=8192 \
  ./src/Tests/StressTest2.ts