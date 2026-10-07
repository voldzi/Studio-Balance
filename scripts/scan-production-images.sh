#!/usr/bin/env bash
# Scan only our selected immutable candidate; do not expose the Docker socket.
set -euo pipefail
umask 077
version="${1:-}"
[[ "$version" =~ ^[0-9a-f]{7,40}$ ]] || { echo 'Usage: scan-production-images.sh <git-sha>' >&2; exit 2; }
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for command in docker flock python3 sha256sum findmnt; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done
root=/srv/studio-balance
x5=/srv/x5-production
scanner=ghcr.io/aquasecurity/trivy@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa
scanner_id=sha256:6d93f1ec925b37c5ce785e416b86cba056e10c8c2914a59a8ea7be18115d6764

# Refuse all filesystem writes unless the approved independent mount is present.
bash "$root/check-production-storage.sh"
exec 8>"$root/.image-scan.lock"
flock -n 8 || { echo 'Another Studio Balance image scan is running' >&2; exit 1; }
[[ "$(docker image inspect --format '{{.Id}}' "$scanner")" == "$scanner_id" ]] || { echo 'Pinned local Trivy image is unavailable or differs' >&2; exit 1; }
declare -A identities
for service in web api worker; do
  identities[$service]="$(docker image inspect --format '{{.Id}}' "studiobalance/$service:$version")"
  [[ "${identities[$service]}" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "Invalid $service image identity" >&2; exit 1; }
done

private_directory() {
  local target="$1"
  [[ ! -L "$target" ]] || { echo 'Refusing symlinked scan directory' >&2; return 1; }
  if [[ ! -e "$target" ]]; then mkdir -m 0700 -- "$target"; fi
  [[ -d "$target" && -w "$target" && "$(stat -c %d "$target")" == "$(stat -c %d "$x5")" && "$(stat -c %a "$target")" == 700 && "$(stat -c %u "$target")" == "$(id -u)" ]] || { echo 'Scan directory must be private, owned, and on X5' >&2; return 1; }
}
bash "$root/check-production-storage.sh"
cd "$x5/staging/studio-balance"
[[ "$(stat -c %d .)" == "$(stat -c %d "$x5")" ]] || exit 1
work="$(mktemp -d ".image-scan-$version.XXXXXXXX")"
work="$PWD/$work"
token="${work##*.}"
container="studio-balance-image-scan-$version-$token"
cache="$x5/cache/studio-balance/trivy"
reports="$x5/archives/studio-balance/image-scans"
report_dir="$reports/$version/$(date -u +%Y%m%dT%H%M%SZ)-$token"
completed=0

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  # An interrupted own scanner may still exist; labels prevent foreign removal.
  if [[ "$(docker inspect --format '{{index .Config.Labels "cz.studiobalance.scan.token"}}' "$container" 2>/dev/null || true)" == "$token" ]]; then
    docker rm -f "$container" >/dev/null 2>&1 || true
  fi
  # Remove only the uniquely created workspace, and never fall back to /srv.
  if bash "$root/check-production-storage.sh" >/dev/null 2>&1 && [[ "$work" == "$x5/staging/studio-balance/.image-scan-$version."* && -d "$work" && ! -L "$work" && "$(stat -c %d "$work")" == "$(stat -c %d "$x5")" ]]; then
    rm -rf -- "$work"
  fi
  if (( completed == 0 )); then echo "Image scan did not pass; evidence: $report_dir" >&2; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
private_directory "$cache"
python3 -I "$script_dir/maintain-production-scan-cache.py" "$cache"
private_directory "$reports"
private_directory "$reports/$version"
mkdir -m 0700 -- "$report_dir"

overall=0
for service in web api worker; do
  ref="studiobalance/$service:$version"
  bash "$root/check-production-storage.sh"
  [[ "$(docker image inspect --format '{{.Id}}' "$ref")" == "${identities[$service]}" ]] || { echo "Candidate image $service changed before scan" >&2; exit 1; }
  tar_file="$work/$service.tar"
  docker image save --output "$tar_file" "$ref"
  [[ "$(docker image inspect --format '{{.Id}}' "$ref")" == "${identities[$service]}" ]] || { echo "Candidate image $service changed during export" >&2; exit 1; }
  sha256sum "$tar_file" > "$report_dir/$service.tar.sha256"
  scan_status=0
  docker run --rm --pull=never --name "$container" \
    --label "cz.studiobalance.scan.token=$token" \
    --label "cz.studiobalance.scan.version=$version" \
    --user "$(id -u):$(id -g)" --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true --memory 1g --memory-swap 1g \
    --cpus 1 --pids-limit 256 --tmpfs /tmp:rw,size=1g,mode=1777 \
    --mount "type=bind,src=$tar_file,dst=/image.tar,readonly" \
    --mount "type=bind,src=$cache,dst=/cache" \
    "$scanner" image --input /image.tar --cache-dir /cache \
    --scanners vuln --pkg-types os,library --severity CRITICAL,HIGH \
    --ignorefile /dev/null --exit-code 1 --exit-on-eol 1 \
    --disable-telemetry --parallel 1 --list-all-pkgs --timeout 10m --format json \
    > "$report_dir/$service.json" 2> "$report_dir/$service.log" || scan_status=$?
  bash "$root/check-production-storage.sh"
  [[ "$(docker image inspect --format '{{.Id}}' "$ref")" == "${identities[$service]}" ]] || { echo "Candidate image $service changed after scan" >&2; exit 1; }
  # A scanner error/empty report must never be interpreted as zero findings.
  validation_status=0
  python3 -I - "$report_dir/$service.json" "${identities[$service]}" "$scan_status" <<'PY' || validation_status=$?
import json, sys
from pathlib import Path
report = json.loads(Path(sys.argv[1]).read_text())
assert report.get('SchemaVersion') == 2, 'Unsupported Trivy report'
metadata = report.get('Metadata', {})
assert metadata.get('ImageID') == sys.argv[2], 'Report image identity differs'
assert metadata.get('OS', {}).get('Family') == 'alpine' and metadata.get('OS', {}).get('Name'), 'Missing/unexpected runtime OS'
assert metadata.get('OS', {}).get('EOSL') is not True, 'Unsupported runtime OS'
results = report.get('Results')
assert isinstance(results, list), 'Incomplete Trivy report'
assert any(item.get('Class') == 'os-pkgs' for item in results), 'Missing OS scan'
assert any(item.get('Class') == 'lang-pkgs' for item in results), 'Missing library scan'
assert all(any(item.get('Packages') for item in results if item.get('Class') == category) for category in ('os-pkgs', 'lang-pkgs')), 'Empty package coverage'
findings = [finding for item in results for finding in (item.get('Vulnerabilities') or [])]
assert all(finding.get('Severity') in ('HIGH', 'CRITICAL') for finding in findings), 'Unexpected scan filter'
status = int(sys.argv[3])
assert status in (0, 1), 'Trivy did not complete successfully'
assert (status == 1) == bool(findings), 'Scanner status and findings differ'
if findings:
    print(f'{Path(sys.argv[1]).stem}: {len(findings)} high/critical findings', file=sys.stderr)
    sys.exit(1)
PY
  if (( validation_status != 0 )); then overall=1; fi
  rm -f -- "$tar_file"
done
# Bound newly generated analysis cache as well; reports are immutable evidence.
bash "$root/check-production-storage.sh"
python3 -I "$script_dir/maintain-production-scan-cache.py" "$cache"
for service in web api worker; do
  [[ "$(docker image inspect --format '{{.Id}}' "studiobalance/$service:$version")" == "${identities[$service]}" ]] || { echo "Candidate image $service changed before final verification" >&2; exit 1; }
done
if (( overall != 0 )); then exit 1; fi
python3 -I - "$report_dir/verified.json" "$version" "$scanner" "${identities[web]}" "${identities[api]}" "${identities[worker]}" <<'PY'
import datetime, json, sys
from pathlib import Path
evidence = {'version': sys.argv[2], 'scanner': sys.argv[3], 'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'images': dict(zip(('web', 'api', 'worker'), sys.argv[4:])), 'high': 0, 'critical': 0}
target = Path(sys.argv[1])
coverage = {}
for service in ('web', 'api', 'worker'):
    results = json.loads(target.with_name(service + '.json').read_text())['Results']
    coverage[service] = {category: sum(len(item.get('Packages') or []) for item in results if item.get('Class') == category) for category in ('os-pkgs', 'lang-pkgs')}
evidence['packageCoverage'] = coverage
pending = target.with_name('.verified.pending.json')
pending.write_text(json.dumps(evidence, indent=2) + '\n')
pending.replace(target)
PY
completed=1
echo "All three candidate image scans passed: $report_dir"
