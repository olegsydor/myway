#!/usr/bin/env python3
"""Run the backup/restore drill with a freshly built local My Way API image."""

import argparse
import json
import os
from pathlib import Path
import sys
import tempfile

from backup_restore import BackupError, DRILL_DB, create_backup, disposable_postgres, restored_database, run


SOURCE_DB = "myway_backup_source"


def api(container, database, image, *command, stdin=None):
    return run([
        "docker", "run", "--rm", "-i", "--pull=never", "--network", f"container:{container}",
        "--env", f"POSTGRES_DB={database}", "--env", "POSTGRES_USER=postgres",
        "--env", "POSTGRES_PASSWORD=drill-only", "--env", "POSTGRES_HOST=127.0.0.1",
        "--env", "APP_ENV=test", "--env", "MAIL_MODE=file",
        image, *command,
    ], step=f"Isolated application check ({command[-1]})", stdin=stdin, fixture_diagnostics=True)


def require(condition, message):
    if not condition:
        raise BackupError(message)


def drill(image):
    fixture = ("python", "-m", "scripts.backup_restore_fixture")
    with tempfile.TemporaryDirectory(prefix="myway-drill-") as workspace:
        with disposable_postgres(SOURCE_DB) as source:
            api(source, SOURCE_DB, image, "alembic", "upgrade", "head")
            expected = api(source, SOURCE_DB, image, *fixture, "seed")
            source_state = json.loads(api(source, SOURCE_DB, image, *fixture, "fingerprint"))
            prefix = ["docker", "exec", "-i", source]
            directory = Path(workspace)
            bad_prefix = ["docker", "exec", "-i", "-e", "POSTGRES_DB=missing", source]
            try:
                create_backup(directory, bad_prefix)
            except BackupError as error:
                require(str(error).startswith("PostgreSQL server version check failed"), str(error))
                require(not list(directory.iterdir()), "Failed backup left a published or partial archive.")
            else:
                raise BackupError("Backup succeeded against a missing database.")
            backup = create_backup(directory, prefix)
            require(backup.stat().st_mode & 0o777 == 0o700, "Backup bundle is not private.")
            for member in backup.iterdir():
                require(member.stat().st_mode & 0o777 == 0o600, "Backup file is not private.")
            print("PASS: backup failure cleanup and private permissions")

            # Simulate corruption on a disposable copy of the synthetic archive.
            dump = backup / "database.dump"
            with dump.open("r+b") as stream:
                stream.seek(-1, os.SEEK_END)
                last = stream.read(1)
                stream.seek(-1, os.SEEK_END)
                stream.write(bytes([last[0] ^ 1]))
            try:
                with restored_database(backup):
                    raise BackupError("Corrupt archive was accepted.")
            except BackupError as error:
                require(str(error) == "Archive SHA-256 mismatch.", str(error))
            with dump.open("r+b") as stream:
                stream.seek(-1, os.SEEK_END)
                stream.write(last)
            print("PASS: custom archive read and SHA-256 corruption rejection")

            with restored_database(backup) as restored:
                restored_state = json.loads(api(restored, DRILL_DB, image, *fixture, "fingerprint"))
                differences = sorted(
                    name for name in source_state.keys() | restored_state.keys()
                    if source_state.get(name) != restored_state.get(name)
                )
                require(not differences, f"Restored database differs in: {', '.join(differences)}")
                print("PASS: table contents, constraints, indexes, sequences and migration revision")
                with tempfile.TemporaryFile() as expected_input:
                    expected_input.write(expected)
                    expected_input.seek(0)
                    api(restored, DRILL_DB, image, *fixture, "verify", stdin=expected_input)
                print("PASS: real login, tenant isolation, graph and workspace read/write")
            require(
                json.loads(api(source, SOURCE_DB, image, *fixture, "fingerprint")) == source_state,
                "Source data changed during the drill.",
            )
        print("PASS: source preserved and disposable database containers removed")


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", help="Local API image built from the current checkout")
    args = parser.parse_args()
    try:
        drill(args.image)
    except BackupError as error:
        sys.exit(str(error))
    except OSError:
        sys.exit("Could not access a local resource needed for the drill.")


if __name__ == "__main__":
    main()
