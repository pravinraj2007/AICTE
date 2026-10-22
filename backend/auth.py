"""OIDC bearer-token validation and server-owned role mappings for FastAPI."""

import json
import os
import time
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import httpx
from jose import jwt
from jose.exceptions import JWTError

_cached_jwks_url: Optional[str] = None
_cached_jwks: Optional[Dict[str, Any]] = None
_cached_jwks_expires_at = 0.0


async def _get_jwks() -> Dict[str, Any]:
    global _cached_jwks_url, _cached_jwks, _cached_jwks_expires_at
    issuer = os.getenv("OIDC_ISSUER")
    jwks_url = os.getenv("OIDC_JWKS_URL")
    audience = os.getenv("OIDC_AUDIENCE")
    if not issuer or not audience or not jwks_url:
        raise RuntimeError("OIDC_NOT_CONFIGURED")
    parsed = urlparse(jwks_url)
    issuer_parsed = urlparse(issuer)
    production = os.getenv("ENVIRONMENT", "development").lower() == "production"
    local_development_provider = (
        not production and parsed.hostname in {"localhost", "127.0.0.1"}
    )
    if (
        (production and issuer_parsed.scheme != "https")
        or (parsed.scheme != "https" and not local_development_provider)
    ):
        raise RuntimeError("OIDC_CONFIGURATION_INVALID")
    if _cached_jwks is None or _cached_jwks_url != jwks_url or time.time() >= _cached_jwks_expires_at:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(jwks_url)
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise RuntimeError("OIDC_PROVIDER_UNAVAILABLE") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("keys"), list):
            raise RuntimeError("OIDC_CONFIGURATION_INVALID")
        _cached_jwks_url = jwks_url
        _cached_jwks = payload
        _cached_jwks_expires_at = time.time() + 300
    return _cached_jwks


async def verify_oidc_token(token: str) -> Dict[str, Any]:
    issuer = os.getenv("OIDC_ISSUER")
    audience = os.getenv("OIDC_AUDIENCE")
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise ValueError("INVALID_TOKEN") from exc
    algorithm = header.get("alg")
    key_id = header.get("kid")
    if algorithm not in {"RS256", "ES256"} or not isinstance(key_id, str):
        raise ValueError("INVALID_TOKEN")

    jwks = await _get_jwks()
    key = next(
        (
            candidate
            for candidate in jwks["keys"]
            if candidate.get("kid") == key_id and candidate.get("alg", algorithm) == algorithm
        ),
        None,
    )
    if key is None:
        raise ValueError("INVALID_TOKEN")
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[algorithm],
            issuer=issuer,
            audience=audience,
            options={"require_exp": True, "require_sub": True},
        )
    except JWTError as exc:
        raise ValueError("INVALID_TOKEN") from exc
    if not isinstance(claims.get("iat"), int):
        raise ValueError("INVALID_TOKEN")
    return claims


def get_server_role_mapping(subject: str) -> Optional[Dict[str, Any]]:
    raw_mapping = os.getenv("OIDC_SUBJECT_USER_MAP", "{}")
    try:
        mapping = json.loads(raw_mapping)
    except json.JSONDecodeError as exc:
        raise RuntimeError("OIDC_MAPPING_INVALID") from exc
    if not isinstance(mapping, dict):
        raise RuntimeError("OIDC_MAPPING_INVALID")
    user = mapping.get(subject)
    if user is None:
        return None
    if (
        not isinstance(user, dict)
        or not isinstance(user.get("id"), str)
        or not isinstance(user.get("name"), str)
        or not isinstance(user.get("email"), str)
        or not isinstance(user.get("createdAt"), str)
        or user.get("role") not in {"INSTITUTION", "REVIEWER", "ADMIN"}
        or not isinstance(user.get("canApproveApplications"), bool)
        or (
            user.get("role") == "INSTITUTION"
            and (not isinstance(user.get("institutionId"), str) or not user.get("institutionId"))
        )
    ):
        raise RuntimeError("OIDC_MAPPING_INVALID")
    return user
