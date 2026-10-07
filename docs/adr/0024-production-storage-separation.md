# ADR 0024: Separate Studio Balance operational, archival and temporary storage

Status: Accepted. Operator explicitly approved the scoped retention and cleanup on 2026-10-07.
Date: 2026-10-07

## Decision

Keep operational configuration and current plus two verified rollback releases in
`/srv/studio-balance`. Move media backups to X5 backups/studio-balance, old
artifacts and secret configuration history to archives/studio-balance, backup
logs to cache/studio-balance and transfer/work artifacts to staging/studio-balance.
The existing dedicated media bucket and external HAProxy PostgreSQL are unchanged.
This supersedes ADR 0012's on-Docker-host backup directory, not its S3 identity or
media restore rules.

Require X5 UUID `2f93f595-b61b-4eea-9054-7afa9b275b5b`, separate writable filesystem,
permissions and 5 GiB reserve before creating data paths or redirects. Fail closed;
never silently write backups/cache to the root filesystem under a missing mount.
Use existing operation locks and checksums before removing original copies.

Bound disposable Next.js image cache to a 128 MiB tmpfs to avoid disk writes and
live cache migration. Deployment and rollback always apply the storage Compose
overlay, including to retained older revisions.

Retain three verified releases/images, all container-used images and marked
in-progress deployments. Proposed media retention is seven daily, four weekly,
three monthly snapshots plus the last verified restorable snapshot. Automatic
cleanup starts only with operator approval. Preserve audit and user records;
secret configuration history has no automatic deletion. Only matching
studiobalance image tags can be removed, without force; no shared prune or volumes.

## Consequences

X5 is still the same Docker host, so it is not an independent backup. The owner
confirmed existing regular Proxmox backup of the complete docker.home.cz including
X5 to another server. Reuse that policy; no new permanent backup destination or
credential is introduced. Whole-server restore and external PostgreSQL/Keycloak
backup acceptance remain infrastructure-owner responsibilities.
BuildKit caches remain shared and cannot safely be pruned within this scope.
See production-storage.md for evidence, rollback and known limitations.
