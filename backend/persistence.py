"""Shared SQLite state persistence used by the Node and FastAPI services."""

import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Optional


def database_path() -> Path:
    configured_path = os.getenv("AICTE_DATABASE_PATH")
    if configured_path:
        return Path(configured_path).expanduser().resolve()
    return Path(__file__).resolve().parent.parent / "data" / "aicte.sqlite"


class SQLiteStateStore:
    def __init__(self, service: str, path: Optional[Path] = None):
        self.service = service
        self.path = path or database_path()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path, timeout=5, check_same_thread=False)
        self.connection.execute("PRAGMA journal_mode = WAL")
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA busy_timeout = 5000")
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS platform_state (
                service TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS platform_records (
                service TEXT NOT NULL,
                collection TEXT NOT NULL,
                record_id TEXT NOT NULL,
                application_id TEXT,
                payload TEXT NOT NULL,
                PRIMARY KEY (service, collection, record_id)
            )
            """
        )
        self.connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_platform_records_application
            ON platform_records (service, application_id, collection)
            """
        )
        self.connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_platform_records_document
            ON platform_records (service, json_extract(payload, '$.documentId'))
            """
        )
        self.connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_platform_records_sha256
            ON platform_records (service, json_extract(payload, '$.sha256Hash'))
            """
        )
        self.connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_platform_records_audit_target
            ON platform_records (service, json_extract(payload, '$.targetId'))
            """
        )
        self.connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_committed_idempotency
            ON platform_records (service, json_extract(payload, '$.idempotencyKey'))
            WHERE collection = 'approval_commands'
                AND json_extract(payload, '$.status') = 'COMMITTED'
            """
        )
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS platform_schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            )
            """
        )
        self.connection.execute(
            """
            INSERT OR IGNORE INTO platform_schema_migrations (version, name, applied_at)
            VALUES (1, 'shared-json-state-and-record-indexes', datetime('now'))
            """
        )
        self.connection.commit()

    def load(self) -> Optional[dict[str, Any]]:
        row = self.connection.execute(
            "SELECT payload FROM platform_state WHERE service = ?",
            (self.service,),
        ).fetchone()
        return json.loads(row[0]) if row else None

    def save(
        self,
        state: dict[str, Any],
        expected_application_versions: Optional[dict[str, int]] = None,
    ) -> None:
        from datetime import datetime, timezone

        payload = json.dumps(state, separators=(",", ":"), allow_nan=False)
        try:
            self.connection.execute("BEGIN IMMEDIATE")
            if expected_application_versions:
                row = self.connection.execute(
                    "SELECT payload FROM platform_state WHERE service = ?",
                    (self.service,),
                ).fetchone()
                stored_state = json.loads(row[0]) if row else {}
                stored_applications = stored_state.get("applications", {})
                for application_id, expected_version in expected_application_versions.items():
                    application = stored_applications.get(application_id)
                    if not application or application.get("version") != expected_version:
                        raise StateConflictError
            self.connection.execute(
                """
                INSERT INTO platform_state (service, payload, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(service) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (self.service, payload, datetime.now(timezone.utc).isoformat()),
            )
            self.connection.execute(
                "DELETE FROM platform_records WHERE service = ?",
                (self.service,),
            )
            insert_record = """
                INSERT INTO platform_records
                    (service, collection, record_id, application_id, payload)
                VALUES (?, ?, ?, ?, ?)
            """
            for collection, records in state.items():
                if isinstance(records, dict):
                    values = records.items()
                elif isinstance(records, list):
                    values = ((None, record) for record in records)
                else:
                    continue
                for key, record in values:
                    if not isinstance(record, dict):
                        continue
                    record_id = record.get("id") or key
                    if not isinstance(record_id, str) or not record_id:
                        continue
                    application_id = record.get("applicationId")
                    if collection == "applications":
                        application_id = record_id
                    self.connection.execute(
                        insert_record,
                        (self.service, collection, record_id, application_id, json.dumps(record, allow_nan=False)),
                    )
            self.connection.commit()
        except StateConflictError:
            self.connection.rollback()
            raise
        except Exception:
            self.connection.rollback()
            raise


class StateConflictError(Exception):
    """The durable application version no longer matches the request snapshot."""
