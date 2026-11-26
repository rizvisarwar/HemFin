"""Outgoing email behind a small interface. Message bodies and API keys are never logged."""

import logging
from typing import Annotated, Protocol

import httpx
from fastapi import Depends, HTTPException

from hemfin.core.config import Settings, get_settings

log = logging.getLogger("hemfin.email")

RESEND_URL = "https://api.resend.com/emails"


class EmailDeliveryError(Exception):
    """The provider did not accept the message. Carries no provider detail."""


class EmailSender(Protocol):
    async def send(self, *, to: str, subject: str, text: str) -> None: ...


class ResendEmailSender:
    def __init__(self, api_key: str, sender: str, timeout: float = 5.0) -> None:
        self._api_key = api_key
        self._from = sender
        self._timeout = timeout

    async def send(self, *, to: str, subject: str, text: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    RESEND_URL,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json={"from": self._from, "to": [to], "subject": subject, "text": text},
                )
        except httpx.HTTPError:
            log.warning("email delivery failed: transport error")
            raise EmailDeliveryError from None
        if resp.status_code >= 300:
            log.warning("email delivery failed: status %s", resp.status_code)
            raise EmailDeliveryError


class UnconfiguredEmailSender:
    async def send(self, *, to: str, subject: str, text: str) -> None:
        raise HTTPException(503, detail="Email sending is not configured.")


def get_email_sender(settings: Annotated[Settings, Depends(get_settings)]) -> EmailSender:
    if settings.RESEND_API_KEY is None or not settings.EMAIL_FROM:
        return UnconfiguredEmailSender()
    return ResendEmailSender(settings.RESEND_API_KEY.get_secret_value(), settings.EMAIL_FROM)
