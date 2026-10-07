# Production storage — Studio Balance

## Scope and inventory (2026-10-07)

Inventory app revision: 0d016c0, API/web/worker healthy at the storage move. No app host-data bind
mounts or local database volumes. PostgreSQL uses HAProxy; media use the dedicated
S3 bucket on storage.home.cz. No database, queue or user/audit record is migrated.

Before relocation: `/home/voldzi/deployments/studio-balance` allocated
1,097,728,000 bytes (artifacts ~539 MiB, releases ~508 MiB, media backups <1 MiB).
Root filesystem used 219,820,142,592 bytes; X5 used 75,797,839,872 bytes.
Host measurements include other applications; report app-specific removal separately.
Docker daemon reported shared build cache 21.08 GB and shared images 108.9 GB;
these totals are not Studio Balance-specific reclaimable space. Never use global prune.

Expected X5 UUID from /etc/fstab and mounted filesystem:
`2f93f595-b61b-4eea-9054-7afa9b275b5b`, ext4 /dev/sdb1, rw/noatime.
Preflight showed ~78 GiB available. Dedicated directories are owned by voldzi,
mode 0700; configuration secrets and backup files stay 0600.

## Paths

| Purpose | New path |
| --- | --- |
| Configuration, tools, deployment locks | `/srv/studio-balance` |
| Current + 2 rollback sources | `/srv/studio-balance/releases/<sha>` |
| Media snapshots | `/srv/x5-production/backups/studio-balance/media` |
| Configuration backup | `/srv/x5-production/backups/studio-balance/config` |
| Old sources, artifacts, compressed image exports | `/srv/x5-production/archives/studio-balance/{releases,artifacts,images}` |
| Historical private configuration | `/srv/x5-production/archives/studio-balance/config-history` |
| Backup logs | `/srv/x5-production/cache/studio-balance` |
| Deployment transfer/work files | `/srv/x5-production/staging/studio-balance` |
| Disposable image-scan exports | `/srv/x5-production/staging/studio-balance/.image-scan-<sha>.<token>` |
| Studio Balance Trivy database/cache | `/srv/x5-production/cache/studio-balance/trivy` |
| Image-scan JSON, tar hashes, verified identities | `/srv/x5-production/archives/studio-balance/image-scans/<sha>/<UTC>-<token>` |
| Disposable live web image cache | tmpfs `/app/apps/web/.next/cache`, max 128 MiB |

No global Docker data-root, shared builder, /var/lib/docker file or foreign app
is changed. Build layers/images still use the daemon's normal storage; successful
release archives are exported to X5 before scoped old image-tag deletion.

The image scanner repeats the same mount/UUID/free-space guard before writes
and owns a separate private `.image-scan.lock` under `/srv/studio-balance`.
It serializes Studio Balance cache use and never reads another application's
Trivy database. A uniquely created workspace exports only the three selected
candidate images; the scanner receives read-only image tar files and its own
writable cache, never the Docker socket or production environment files.
Identity checks before/after export and scanning reject retagged candidates.
The trap removes only its token-labelled scanner and its unique workspace;
it refuses an internal-disk cleanup fallback if X5 has disappeared. Interrupted
or failed JSON/log evidence stays in the owned archive. These scan receipts
are audit evidence and are not automatically deleted by release retention.
Trivy database/cache is rebuildable. Under the idle scanner lock, the scanner
checks its explicit ownership/creation marker and resets only this cache when
age reaches 14 days or total size exceeds 2 GiB, before and after scanning.
Unmanaged contents, symlinks, foreign ownership and special files are refused
instead of deleted. Audit reports have no automatic deletion policy. This
bounded cache reset does not delete other archived records.
The existing daily `manage-production-storage.py --apply` also applies the
same policy under a nonblocking scanner lock, so unused cache does not require
a future deployment to expire. A busy scanner defers only its cache cleanup;
dry-run reports the proposed cache reset without changing cache contents.
The helper is published with the selected complete maintenance snapshot;
no additional cron job or foreign cache path is introduced.

## Deployment and retention

Every new production deploy checks the mount before remote mkdir/SCP and uses a
unique `.deploy-<sha>.<random>` directory on X5. The verified staging working
directory pins the filesystem during creation. Source, entrypoint, tools and
storage overlay all come from the exact selected Git commit. The remote
entrypoint takes the production operation lock before publishing tools or
release sources, then the media lock while atomically replacing complete private
tool files. It releases the media lock before the build; the child deployment
inherits and verifies the production lock inode. Existing release sources are
immutable and a differing copy is refused. Historical commits without this
entrypoint remain available through the guarded rollback command.

The runtime guard repeats before Compose changes. Successful readiness requires
all three running healthy containers to match the selected image tags, image IDs
and APP_VERSION, API readiness, web HTTP availability, and a successful worker
generation since the current container startup. Only then is
verified-releases.json updated and the successful staging directory/marker
removed. Current and two prior verified revisions are retained. An interrupted
candidate marker deliberately blocks unsafe cleanup; operator resolves it only
after checking the deployment.

Automatic rollback passes the previous immutable release directory to the same
guarded rollback tool used by explicit rollback. It restores that revision's
Compose definition together with its images, so a new candidate's worker
healthcheck cannot be applied to an older image. A missing previous release
source fails closed before any rollback container changes.

`manage-production-storage.py` defaults to dry run. `--apply` requires approved
retention: current + two rollback releases, all container-used images, pending
candidate markers; media 7 daily / 4 weekly / 3 monthly + verified restore anchor.
It acquires both production and media locks, refuses cleanup if busy, verifies
every retained media manifest/object (including the verified restore anchor) with
streamed SHA-256 and size checks, archives protected images and removes only scoped matching
SHA release/artifact paths and studiobalance/{api,web,worker}:<sha> tags without force.
No user history/audit/config-history deletion. Failed/incomplete media snapshots
are preserved for operator review.

The worker readiness marker is private atomic JSON under
`/tmp/studio-balance-worker-ready.json`, in a 4 MiB container tmpfs. It is removed
at startup and created only after successful generation with the schedule lock.
An absent, damaged, stale (>7 hours), future, or wrong-version marker fails the
worker healthcheck. Lock contention retries after 10 seconds. Retained older
rollback images are checked by their successful generation log since startup.
Checksum checks confirm file integrity; they do not replace restore drills or
the independently retained Proxmox backup.

Completed work directories named `completed-*` older than 14 days are removed
only under idle locks. Transfer artifacts are removed immediately after success.
Backup logs rotate above 10 MiB (one previous file, about 20 MiB total); each
backup is bounded by S3 snapshot size and 5 GiB free-space reserve. Successful
workflow staging is <1 GiB; failed or unfamiliar work is not deleted by name/age.
Large abandoned work requires operator review. Shared builder cache is out of scope.

Cron uses only the Studio Balance managed block: daily media backup 03:40,
hourly verification :15, retention 05:20 (server timezone). No redirect is opened
on X5 until mount verification. Install dry-run mode with
`python3 /srv/studio-balance/install-media-backup-cron.py`; after approval activate
`--enable-retention`. Other applications' crontab blocks are preserved.

## Acceptance and recovery

Migration runs with both old locks and uses rsync -aH plus checksum/metadata
comparison. Only lock timestamps and root directory modification time are excluded
from the second configuration comparison because the migration itself changes them.
No secrets are printed. Old sources remain until application, backup and restore pass.
New media backup created and checked: 2 objects, 163,108 bytes. Restore to isolated
X5 staging passed SHA-256 for both objects and byte equality of both configuration
files; restored staging copies removed. verified.json pins this restorable backup.
This proves file recovery, not a full PostgreSQL/identity disaster recovery drill.
Web accepts the same live image with bounded tmpfs; API/database stay running.

Rollback: before original removal, stop the dedicated backup cron, lock both
operations, restore original paths/cron and remove the storage overlay; restart web
with its unchanged image. After removal, guarded rollback uses the preserved
sources and images pinned by the current `verified-releases.json` ledger. After
the security release on 2026-10-07 these are 1923ef305c679d0da28c3973e86ea3e5f886bf96,
0d016c0 and 817f7ff; 0f51679 was retired by the approved rolling retention.
If local images are lost, verify
`gzip -t` on X5 archives then `gzip -dc <sha>.tar.gz | docker image load`; use
`pnpm rollback:production -- <sha>`. Never switch runtime version during a file-restore
probe or restore production DB without its separately approved runbook.

If X5 is absent, backup/deployment/retention stop before writes. Existing running
web/API continue with cache in memory. Repair/remount the expected filesystem,
verify UUID/permissions/free capacity, then rerun; no internal-disk fallback.

## Independent backup boundary

The owner confirmed on 2026-10-07 that Proxmox regularly backs up all of
docker.home.cz including X5 to another server. This existing independent path is
retained. No second permanent backup destination was added. A temporary off-host
copy on storage.home.cz passed media checksums and was then removed as redundant.
A full Proxmox restore was not performed in this application-scoped task; verify
job success/restore acceptance and external PostgreSQL/Keycloak coverage with the
infrastructure owner. Do not reuse another application's credentials or move DB state.

## Completion receipt — 2026-10-07

User explicitly approved 168 old paths and 70 unused Studio Balance image tags.
Cleanup completed, automatic retention enabled; a subsequent dry run proposes
zero further removals. Retained image exports 0d016c0, 817f7ff, 0f51679 passed gzip
integrity; docker image load restored all three 817f7ff images without switching
runtime. API/web/worker still healthy on 0d016c0; new media backup check passed.

Old duplicate directory allocated 1,097,904,128 bytes when removed; new operational
root allocates 26,255,360 bytes. Net attributable regular-file reduction is
1,071,648,768 bytes (about 1.00 GiB), plus cleanup of 70 unused image tags. Physical
image-layer recovery cannot be attributed from host-wide df because other
applications performed concurrent disk operations. No claim of global df reduction
is made. X5 Studio Balance allocation: backups 278,528; archives 461,828,096;
cache 102,400; staging 90,112 bytes (about 441 MiB total). Whole-X5 snapshot used
76,350,033,920 bytes, available 83,008,147,456 bytes. These live global values drift.

Legacy /home/voldzi/deployments/studio-balance is now only a symlink to the guarded
/srv root; it contains no duplicate data. Historical private configuration remains
on X5. Successful migration tools/receipts are classified as completed work and
expire after 14 days under idle locks. Runtime web/API are unchanged application
images; this is an operational scripts/Compose change, not a new application build.
