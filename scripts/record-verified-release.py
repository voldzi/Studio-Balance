#!/usr/bin/env python3
"""Called after readiness passes, under the deployment operation lock."""
import json
import os
from pathlib import Path
import re
import sys

version = sys.argv[1]
assert re.fullmatch('[0-9a-f]{7,40}', version)
target = Path('/srv/studio-balance/verified-releases.json')
old = json.loads(target.read_text())['versions'] if target.exists() else []
temporary = target.with_suffix('.pending')
temporary.write_text(json.dumps({'versions': [version] + [v for v in old if v != version]}))
temporary.chmod(0o600)
os.replace(temporary, target)
