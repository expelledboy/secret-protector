#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from secret_protector.app import main


if __name__ == "__main__":
    script = Path(__file__).resolve()
    package = script.parent / "secret_protector"
    raise SystemExit(main(script_path=script, package_path=package))
