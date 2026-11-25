import logging
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

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
