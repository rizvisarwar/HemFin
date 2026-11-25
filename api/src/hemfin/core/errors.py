import logging
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from hemfin.core.logging import request_id_var

PROBLEM_JSON = "application/problem+json"
log = logging.getLogger("hemfin.errors")


def problem_response(
    status: int,
    title: str | None = None,
    detail: str | None = None,
    request: Request | None = None,
    headers: dict[str, str] | None = None,
    **extra: Any,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": title or HTTPStatus(status).phrase,
        "status": status,
    }
    if detail is not None:
        body["detail"] = detail
    if request is not None:
        body["instance"] = request.url.path
    rid = request_id_var.get()
    if rid:
        body["request_id"] = rid
    body.update(extra)
    return JSONResponse(body, status_code=status, media_type=PROBLEM_JSON, headers=headers)


async def _http_exc(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    detail: str | None = exc.detail if isinstance(exc.detail, str) else None
    if detail == HTTPStatus(exc.status_code).phrase:
        detail = None
    return problem_response(
        exc.status_code, detail=detail, request=request, headers=dict(exc.headers or {})
    )


async def _validation_exc(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    errors = [
        {"loc": [str(p) for p in e["loc"]], "msg": e["msg"], "type": e["type"]}
        for e in exc.errors()
    ]
    return problem_response(
        422,
        title="Validation Error",
        detail="Request validation failed.",
        request=request,
        errors=errors,
    )


async def _unhandled_exc(request: Request, exc: Exception) -> JSONResponse:
    log.error("unhandled exception", exc_info=exc)
    return problem_response(500, detail="An unexpected error occurred.", request=request)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, _http_exc)
    app.add_exception_handler(RequestValidationError, _validation_exc)
    app.add_exception_handler(Exception, _unhandled_exc)


class UnhandledErrorMiddleware:
    """Innermost middleware: turns unhandled exceptions into a problem+json 500.

    Starlette runs `Exception` handlers in ServerErrorMiddleware, outside every user
    middleware, so the 500 would miss CORS headers and the request id. Catching here lets
    the response flow back out through those middlewares.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            if started:
                raise
            log.error("unhandled exception", exc_info=exc)
            response = problem_response(
                500, detail="An unexpected error occurred.", request=Request(scope)
            )
            await response(scope, receive, send)
