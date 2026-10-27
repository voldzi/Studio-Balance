#!/usr/bin/env python3
"""Bound Studio Balance release disk use; never bypass a failed measurement."""
import shutil
import sys

MINIMUM_GIB = {"build": 15, "activate": 10}


def require_space(stage, free_bytes):
    if stage not in MINIMUM_GIB:
        raise ValueError("Unknown deployment disk phase")
    if free_bytes < MINIMUM_GIB[stage] * 1024 ** 3:
        raise RuntimeError(f"Deployment refused: {stage} requires {MINIMUM_GIB[stage]} GiB available on /.")


def main(stage):
    require_space(stage, shutil.disk_usage("/").free)


if __name__ == "__main__":
    try:
        main(sys.argv[1])
    except (IndexError, ValueError, OSError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
