#!/usr/bin/env python3
"""Create private My Way backups and rehearse recovery in disposable PostgreSQL."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
IMAGE = "postgres:17"
DRILL_DB = "myway_restore_test"
DB_TOOLS = """
set -eu
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGSERVICE PGOPTIONS PGPASSFILE
export PGCONNECT_TIMEOUT=10
export PGPASSWORD="$POSTGRES_PASSWORD"
exec "$@" --no-password --host=/var/run/postgresql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"
"""


class BackupError(Exception):
    pass


def run(command, *, step, stdin=None, stdout=subprocess.PIPE, cwd=None, strict_stderr=False, fixture_diagnostics=False):
    result = subprocess.run(
        command, stdin=stdin if stdin is not None else subprocess.DEVNULL,
        stdout=stdout, stderr=subprocess.PIPE, cwd=cwd, check=False,
    )
    if result.returncode:
        reason = ""
        if fixture_diagnostics:
            diagnostic = re.fullmatch(rb"Fixture failure on line [0-9]+ \([A-Za-z]+\)\.\n", result.stderr)
            if diagnostic:
                reason = f" {diagnostic[0].decode().strip()}"
        raise BackupError(f"{step} failed (exit {result.returncode}).{reason}")
    if strict_stderr and result.stderr:
        raise BackupError(f"{step} produced diagnostics. Output withheld for privacy.")
    return result.stdout


def database_command(exec_prefix, *args):
    return [*exec_prefix, "sh", "-c", DB_TOOLS, "myway-db", *args]


def private_directory(path):
    path = path.expanduser().resolve()
    if path.is_relative_to(ROOT):
        raise BackupError("Use a backup directory outside the application checkout.")
    path.mkdir(mode=0o700, exist_ok=True)
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise BackupError("Backup directory must be owned by you and private (chmod 700).")
    return path


def file_digest(stream):
    stream.seek(0)
    digest = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)
    stream.seek(0)
    return digest.hexdigest()


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def create_backup(directory, exec_prefix):
    directory = private_directory(directory)
    release = directory / f"myway-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{uuid4().hex}"
    staging = Path(tempfile.mkdtemp(prefix=".myway-incomplete-", dir=directory))
    try:
        version = run(
            database_command(exec_prefix, "psql", "-XAt", "-v", "ON_ERROR_STOP=1",
                             "-c", "SHOW server_version_num"),
            step="PostgreSQL server version check", cwd=ROOT,
        ).strip()
        if not version.isdigit() or int(version) // 10000 != 17:
            raise BackupError("Expected a PostgreSQL 17 server.")
        for tool in ("pg_dump", "pg_restore"):
            version = run([*exec_prefix, tool, "--version"], step=f"{tool} version check", cwd=ROOT)
            if not version.startswith(f"{tool} (PostgreSQL) 17.".encode()):
                raise BackupError(f"Expected {tool} from PostgreSQL 17.")
        with (staging / "database.dump").open("w+b", buffering=0) as dump:
            run(
                database_command(exec_prefix, "pg_dump", "--format=custom", "--lock-wait-timeout=15s"),
                step="pg_dump", stdout=dump, cwd=ROOT, strict_stderr=True,
            )
            dump.flush()
            os.fsync(dump.fileno())
            dump.seek(0)
            if dump.read(5) != b"PGDMP":
                raise BackupError("Expected a custom PostgreSQL archive.")
            digest = file_digest(dump)
            run([*exec_prefix, "pg_restore", "--file=/dev/null"],
                step="Full archive read", stdin=dump, cwd=ROOT, strict_stderr=True)
        with (staging / "database.dump.sha256").open("w") as checksum:
            checksum.write(f"{digest}  database.dump\n")
            checksum.flush()
            os.fsync(checksum.fileno())
        sync_directory(staging)
        staging.rename(release)
        sync_directory(directory)
        return release
    finally:
        if staging.exists():
            shutil.rmtree(staging)


@contextmanager
def verified_archive(directory):
    directory = directory.expanduser().resolve(strict=True)
    for member in (directory, directory / "database.dump", directory / "database.dump.sha256"):
        info = member.lstat()
        expected_type = stat.S_ISDIR if member == directory else stat.S_ISREG
        if not expected_type(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise BackupError("Archive and checksum must be private files in a private directory.")
    expected = (directory / "database.dump.sha256").read_text(encoding="ascii")
    with (directory / "database.dump").open("rb", buffering=0) as dump:
        if expected != f"{file_digest(dump)}  database.dump\n":
            raise BackupError("Archive SHA-256 mismatch.")
        if dump.read(5) != b"PGDMP":
            raise BackupError("Expected a custom PostgreSQL archive.")
        dump.seek(0)
        yield dump


@contextmanager
def disposable_postgres(database=DRILL_DB, *, image=IMAGE):
    name = f"myway-cp5-{uuid4().hex}"
    # An isolated namespace has only loopback. The password is synthetic.
    container = run([
        "docker", "run", "--detach", "--rm", "--pull=never", "--name", name,
        "--network=none", "--tmpfs=/var/lib/postgresql/data",
        "--env", "POSTGRES_USER=postgres", "--env", f"POSTGRES_DB={database}", "--env", "POSTGRES_PASSWORD=drill-only",
        image,
    ], step="Start isolated PostgreSQL").decode().strip()
    try:
        deadline = time.monotonic() + 60
        while subprocess.run(
            ["docker", "exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", database],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
        ).returncode:
            if time.monotonic() >= deadline:
                raise BackupError("Isolated PostgreSQL did not become ready.")
            time.sleep(1)
        yield container
    finally:
        run(["docker", "stop", "--time=10", container], step=f"Stop isolated PostgreSQL {name}")


@contextmanager
def restored_database(directory, *, image=IMAGE):
    # Check bytes before creating a target. There is no destination argument.
    with verified_archive(directory) as dump, disposable_postgres(image=image) as container:
        run([
            "docker", "exec", "-i", container, "pg_restore",
            "--host=/var/run/postgresql", "--username=postgres", f"--dbname={DRILL_DB}",
            "--no-password", "--no-owner", "--no-privileges", "--no-tablespaces",
            "--single-transaction", "--exit-on-error",
        ], step="Restore into isolated PostgreSQL", stdin=dump, strict_stderr=True)
        yield container


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    backup = actions.add_parser("backup")
    backup.add_argument("directory", type=Path)
    backup.add_argument("--production-env", type=Path)
    backup.add_argument("--project-name", help="Override myway-prod for a disposable production-like project")
    restore = actions.add_parser("restore-test")
    restore.add_argument("directory", type=Path)
    restore.add_argument("--postgres-image", default=IMAGE, help="Local PostgreSQL 17 image for the isolated restore")
    args = parser.parse_args()
    if args.action == "backup" and args.project_name and args.production_env is None:
        parser.error("--project-name requires --production-env")
    try:
        if args.action == "backup":
            compose = ["docker", "compose"]
            if args.production_env is not None:
                compose += [
                    "--project-name", args.project_name or "myway-prod",
                    "--file", str(ROOT / "docker-compose.prod.yml"),
                    "--env-file", str(args.production_env.expanduser().resolve(strict=True)),
                ]
            path = create_backup(args.directory, [*compose, "exec", "-T", "db"])
            print(f"Backup verified and saved in {path}")
        else:
            with restored_database(args.directory, image=args.postgres_image):
                print("SHA-256 verified and archive restored in one transaction.")
            print("Isolated PostgreSQL removed.")
    except BackupError as exc:
        sys.exit(str(exc))
    except (OSError, UnicodeError):
        sys.exit("Backup or restore could not read or write a required local resource.")


if __name__ == "__main__":
    main()
