#!/usr/bin/env python3
"""Commandes portables du TP : les mêmes contrôles que la CI, en local."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICES = ("events", "bookings")


def run(*command: str) -> None:
    print(f"+ {' '.join(command)}", flush=True)
    # shutil.which trouve npm.cmd sous Windows et npm ailleurs.
    executable = shutil.which(command[0])
    if executable is None:
        raise RuntimeError(f"commande introuvable : {command[0]}")
    subprocess.run([executable, *command[1:]], cwd=ROOT, check=True)


def prerequisites() -> None:
    missing = [tool for tool in ("node", "npm", "docker") if shutil.which(tool) is None]
    if missing:
        raise RuntimeError(f"outils manquants : {', '.join(missing)}")
    print("OK node, npm, docker")


def install() -> None:
    run("npm", "ci")
    for name in SERVICES:
        run("npm", "ci", "--prefix", f"services/{name}-service")


def test(*names: str) -> None:
    for name in names or SERVICES:
        run("npm", "--prefix", f"services/{name}-service", "test")


def lint(*names: str) -> None:
    for name in names or SERVICES:
        run("npm", "run", f"lint:{name}")


def verify() -> None:
    test()
    lint()


COMMANDS = {
    "prerequisites": prerequisites,
    "install": install,
    "test": test,
    "test-events": lambda: test("events"),
    "test-bookings": lambda: test("bookings"),
    "lint": lint,
    "lint-events": lambda: lint("events"),
    "lint-bookings": lambda: lint("bookings"),
    "verify": verify,
    "compose-up": lambda: run("docker", "compose", "up", "--build", "--detach"),
    "compose-down": lambda: run("docker", "compose", "down"),
    "smoke": lambda: run("node", "scripts/smoke-test.mjs", "http://localhost:8080"),
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=COMMANDS)
    try:
        COMMANDS[parser.parse_args().command]()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"ERREUR : {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
