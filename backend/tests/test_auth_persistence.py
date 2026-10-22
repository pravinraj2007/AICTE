import os
import base64
import json
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from jose import jwt

from backend.main import app, store
from backend.persistence import SQLiteStateStore, StateConflictError


class TestAuthenticationAndPersistence(unittest.TestCase):
    def setUp(self):
        store.reset()
        self.client = TestClient(app)
        self.institution_user = {
            "id": "usr-inst-test",
            "name": "Test institution",
            "email": "institution@example.invalid",
            "role": "INSTITUTION",
            "institutionId": "inst-1",
            "canApproveApplications": False,
        }
        store.users.append(self.institution_user)

    def tearDown(self):
        store.users = [user for user in store.users if user["id"] != "usr-inst-test"]

    def test_anonymous_and_caller_supplied_identity_are_rejected(self):
        response = self.client.get(
            "/api/v1/applications",
            headers={"x-user-id": "usr-reviewer-1"},
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"]["code"], "TOKEN_REQUIRED")

    def test_valid_oidc_token_uses_server_role_mapping_and_institution_scope(self):
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private_pem = private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        public_numbers = private_key.public_key().public_numbers()

        def encode_integer(value):
            return base64.urlsafe_b64encode(
                value.to_bytes((value.bit_length() + 7) // 8, "big")
            ).rstrip(b"=").decode("ascii")

        public_jwk = {
            "kty": "RSA",
            "kid": "test-key",
            "alg": "RS256",
            "use": "sig",
            "n": encode_integer(public_numbers.n),
            "e": encode_integer(public_numbers.e),
        }
        token = jwt.encode(
            {
                "iss": "https://identity.example.invalid",
                "aud": "aicte-test",
                "sub": "institution-subject",
                "role": "ADMIN",
                "iat": int(time.time()),
                "exp": int(time.time()) + 60,
            },
            private_pem,
            algorithm="RS256",
            headers={"kid": "test-key"},
        )
        role_mapping = {
            "institution-subject": {
                **self.institution_user,
                "createdAt": "2026-01-01T00:00:00Z",
            }
        }
        with patch.dict(
            os.environ,
            {
                "OIDC_ISSUER": "https://identity.example.invalid",
                "OIDC_AUDIENCE": "aicte-test",
                "OIDC_JWKS_URL": "https://identity.example.invalid/jwks",
                "OIDC_SUBJECT_USER_MAP": json.dumps(role_mapping),
                "ENVIRONMENT": "development",
            },
        ):
            with patch("backend.auth._get_jwks", new_callable=AsyncMock, return_value={"keys": [public_jwk]}):
                response = self.client.get(
                    "/api/v1/applications",
                    headers={"authorization": f"Bearer {token}"},
                )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total"], 2)
        self.assertTrue(
            all(application["institutionId"] == "inst-1" for application in response.json()["applications"])
        )

    def test_explicit_demo_mode_is_required_for_local_role_selection(self):
        with patch.dict(os.environ, {"AICTE_DEMO_ROLE_SWITCH_ENABLED": "false", "ENVIRONMENT": "development"}):
            denied = self.client.get(
                "/api/v1/applications",
                headers={"x-demo-user-id": "usr-reviewer-1"},
            )
        self.assertEqual(denied.status_code, 401)

        with patch.dict(os.environ, {"AICTE_DEMO_ROLE_SWITCH_ENABLED": "true", "ENVIRONMENT": "development"}):
            allowed = self.client.get(
                "/api/v1/applications",
                headers={"x-demo-user-id": "usr-inst-test"},
            )
            self.assertEqual(allowed.status_code, 200)
            self.assertEqual(allowed.json()["total"], 2)

    def test_institution_cannot_read_another_institutions_application(self):
        with patch.dict(os.environ, {"AICTE_DEMO_ROLE_SWITCH_ENABLED": "true", "ENVIRONMENT": "development"}):
            response = self.client.get(
                "/api/v1/applications/app-8",
                headers={"x-demo-user-id": "usr-inst-test"},
            )
        self.assertEqual(response.status_code, 404)

    def test_non_approver_cannot_approve_and_institution_cannot_verify_documents(self):
        with patch.dict(os.environ, {"AICTE_DEMO_ROLE_SWITCH_ENABLED": "true", "ENVIRONMENT": "development"}):
            approval = self.client.post(
                "/api/v1/applications/app-1/approval",
                headers={"x-demo-user-id": "usr-reviewer-2"},
                json={"expectedVersion": 1, "idempotencyKey": "blocked-test"},
            )
            document_verification = self.client.post(
                "/api/v1/documents/doc-fdr-delhi/verify",
                headers={"x-demo-user-id": "usr-inst-test"},
            )
        self.assertEqual(approval.status_code, 403)
        self.assertEqual(document_verification.status_code, 403)

    def test_failed_durable_write_rolls_back_document_version_and_returns_failure(self):
        def fail_write(*_args, **_kwargs):
            raise OSError("simulated durable-store failure")

        before_version = next(doc for doc in store.documents if doc["id"] == "doc-fdr-delhi")["version"]
        with patch.dict(os.environ, {"AICTE_DEMO_ROLE_SWITCH_ENABLED": "true", "ENVIRONMENT": "development"}):
            with patch.object(store._persistence, "save", side_effect=fail_write):
                response = self.client.post(
                    "/api/v1/applications/app-1/documents/doc-fdr-delhi/replace",
                    headers={"x-demo-user-id": "usr-inst-test"},
                    json={"replacement_reason": "test only"},
                )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "PERSISTENCE_FAILED")
        self.assertEqual(
            next(doc for doc in store.documents if doc["id"] == "doc-fdr-delhi")["version"],
            before_version,
        )

    def test_sqlite_state_survives_reconstruction_and_rejects_stale_versions(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "state.sqlite"
            first_store = SQLiteStateStore("restart-test", database_path)
            first_store.save(
                {"applications": {"app-test": {"id": "app-test", "version": 1, "status": "DRAFT"}}}
            )
            restarted_store = SQLiteStateStore("restart-test", database_path)
            self.assertEqual(restarted_store.load()["applications"]["app-test"]["version"], 1)
            restart_probe = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    (
                        "import json, sys; from pathlib import Path; "
                        "from backend.persistence import SQLiteStateStore; "
                        "state = SQLiteStateStore('restart-test', Path(sys.argv[1])); "
                        "print(json.dumps(state.load()))"
                    ),
                    str(database_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertEqual(json.loads(restart_probe.stdout)["applications"]["app-test"]["version"], 1)

            restarted_store.save(
                {"applications": {"app-test": {"id": "app-test", "version": 2, "status": "REVIEW_COMPLETED"}}},
                {"app-test": 1},
            )
            with self.assertRaises(StateConflictError):
                restarted_store.save(
                    {"applications": {"app-test": {"id": "app-test", "version": 3, "status": "REVIEW_COMPLETED"}}},
                    {"app-test": 1},
                )
            self.assertEqual(restarted_store.load()["applications"]["app-test"]["version"], 2)
            first_store.connection.close()
            restarted_store.connection.close()


if __name__ == "__main__":
    unittest.main()
