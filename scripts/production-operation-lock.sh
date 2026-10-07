#!/usr/bin/env bash
# Sourced by the remote entrypoint and deployment/rollback. The inherited FD
# must reference exactly the expected inode; flock still verifies ownership.
acquire_studio_operation_lock() {
  local operation_lock="$1"
  if [[ "${STUDIO_BALANCE_OPERATION_LOCK_FD:-}" == 9 ]]; then
    [[ -e /proc/$$/fd/9 && "$(stat -Lc '%d:%i' /proc/$$/fd/9)" == "$(stat -Lc '%d:%i' "$operation_lock")" ]] || { echo 'Invalid inherited operation lock' >&2; return 1; }
  else
    exec 9>"$operation_lock"
  fi
  flock -n 9 || { echo 'Another Studio Balance production operation is running' >&2; return 1; }
  export STUDIO_BALANCE_OPERATION_LOCK_FD=9
}
