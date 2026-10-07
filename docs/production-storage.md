# Production storage — Studio Balance

## Scope and inventory (2026-10-07)

Production app revision: 0d016c0, API/web/worker healthy. No app host-data bind
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
| Disposable live web image cache | tmpfs `/app/apps/web/.next/cache`, max 128 MiB |

No global Docker data-root, shared builder, /var/lib/docker file or foreign app
is changed. Build layers/images still use the daemon's normal storage; successful
release archives are exported to X5 before scoped old image-tag deletion.

## Deployment and retention

Every production deploy checks the mount before remote mkdir/SCP, marks its
candidate `.deploying-<sha>`, uses X5 for transfer archives and removes the
successful transfer file. The runtime guard repeats before Compose changes.
Successful readiness updates verified-releases.json; current and two prior
verified revisions are retained. An interrupted candidate marker deliberately
blocks unsafe cleanup; operator resolves it only after checking the deployment.

`manage-production-storage.py` defaults to dry run. `--apply` requires approved
retention: current + two rollback releases, all container-used images, pending
candidate markers; media 7 daily / 4 weekly / 3 monthly + verified restore anchor.
It acquires both production and media locks, refuses cleanup if busy, verifies
latest media checksums, archives protected images and removes only scoped matching
SHA release/artifact paths and studiobalance/{api,web,worker}:<sha> tags without force.
No user history/audit/config-history deletion. Failed/incomplete media snapshots
are preserved for operator review.

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
sources and images for 0d016c0, 817f7ff, 0f51679. If local images are lost, verify
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

