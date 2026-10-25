import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests

DEFAULT_ENDPOINT = "https://salsysos.com/api/events/v1"


def send_salsys_server_event(
    event_name: str,
    event_id: str,
    properties: Dict[str, Any],
    *,
    endpoint: Optional[str] = None,
    source_key: Optional[str] = None,
    secret: Optional[str] = None,
    occurred_at: Optional[str] = None,
    site: Optional[str] = None,
    anonymous_visitor_id: Optional[str] = None,
    session_key: Optional[str] = None,
    external_message_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
    timeout: float = 5.0,
) -> Dict[str, Any]:
    endpoint = endpoint or DEFAULT_ENDPOINT
    source_key = source_key or os.getenv("SALSYS_SERVER_SOURCE_KEY", "")
    secret = secret or os.getenv("SALSYS_SERVER_SECRET", "")

    if not source_key or not secret:
        return {
            "ok": False,
            "sent": False,
            "status": None,
            "error": "Salsys server tracking credentials are not configured.",
        }

    body: Dict[str, Any] = {
        "event_id": event_id,
        "event_name": event_name,
        "schema_version": 1,
        "occurred_at": occurred_at or datetime.now(timezone.utc).isoformat(),
        "site": site,
        "properties": properties,
        "metadata": {
            "integration": "python_backend",
            "trusted_business_event": True,
            **(metadata or {}),
        },
    }

    if anonymous_visitor_id:
        body["anonymous_visitor_id"] = anonymous_visitor_id
    if session_key:
        body["session_key"] = session_key
    if external_message_id:
        body["external_message_id"] = external_message_id
    if context:
        body["context"] = context

    try:
        response = requests.post(
            endpoint,
            headers={
                "Content-Type": "application/json",
                "X-Salsys-Source-Key": source_key,
                "Authorization": f"Bearer {secret}",
            },
            json=body,
            timeout=timeout,
        )
    except requests.RequestException as exc:
        return {
            "ok": False,
            "sent": False,
            "status": None,
            "error": str(exc),
        }

    try:
        payload = response.json()
    except ValueError:
        payload = None

    accepted = isinstance(payload, dict) and payload.get("accepted") is True
    duplicate = isinstance(payload, dict) and payload.get("duplicate") is True

    return {
        "ok": response.ok and (accepted or duplicate),
        "sent": True,
        "status": response.status_code,
        "accepted": accepted,
        "duplicate": duplicate,
        "response": payload,
        "error": None if response.ok else f"Salsys returned HTTP {response.status_code}",
    }


def booking_event(
    event_name: str,
    booking_reference: str,
    customer: Dict[str, Any],
    details: Optional[Dict[str, Any]] = None,
    **options: Any,
) -> Dict[str, Any]:
    properties = {
        **(details or {}),
        "booking_reference": booking_reference,
        "email": customer.get("email", ""),
        "phone": customer.get("phone", ""),
    }
    return send_salsys_server_event(
        event_name,
        f"{event_name.replace('.', '_')}:{booking_reference}",
        properties,
        **options,
    )


def payment_event(
    event_name: str,
    payment_reference: str,
    booking_reference: str,
    customer: Dict[str, Any],
    payment: Dict[str, Any],
    **options: Any,
) -> Dict[str, Any]:
    properties = {
        "payment_reference": payment_reference,
        "booking_reference": booking_reference,
        "email": customer.get("email", ""),
        "phone": customer.get("phone", ""),
        "provider": payment.get("provider") or payment.get("gateway") or "",
        "payment_kind": payment.get("payment_kind", "other"),
        "amount": float(payment.get("amount", 0) or 0),
        "currency": str(payment.get("currency", "")).upper(),
    }
    return send_salsys_server_event(
        event_name,
        f"{event_name.replace('.', '_')}:{payment_reference}",
        properties,
        **options,
    )


def enrollment_completed(
    enrollment_reference: str,
    booking_reference: str,
    customer: Dict[str, Any],
    enrollment: Optional[Dict[str, Any]] = None,
    **options: Any,
) -> Dict[str, Any]:
    properties = {
        **(enrollment or {}),
        "enrollment_reference": enrollment_reference,
        "booking_reference": booking_reference,
        "email": customer.get("email", ""),
        "phone": customer.get("phone", ""),
    }
    return send_salsys_server_event(
        "enrollment.completed",
        f"enrollment_completed:{enrollment_reference}",
        properties,
        **options,
    )
