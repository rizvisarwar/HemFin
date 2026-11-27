import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from hemfin.core import db
from hemfin.core.config import get_settings
from hemfin.core.errors import (
    PROBLEM_JSON,
    UnhandledErrorMiddleware,
    problem_response,
    register_exception_handlers,
)
from hemfin.core.logging import RequestIdMiddleware, configure_logging
from hemfin.core.telemetry import setup_telemetry
from hemfin.modules.categories import router as categories_router
from hemfin.modules.contracts import router as contracts_router
from hemfin.modules.dashboard import router as dashboard_router
from hemfin.modules.expenses import router as expenses_router
from hemfin.modules.income import router as income_router
from hemfin.modules.invitations import router as invitations_router
from hemfin.modules.jobs import router as jobs_router
from hemfin.modules.profile import router as profile_router
from hemfin.modules.spaces import router as spaces_router
from hemfin.modules.users import router as users_router

log = logging.getLogger("hemfin.health")

# The only environments where the test-only startup bypass may be enabled.
TEST_MODE_ENVS = {"local", "test"}


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    if settings.HEMFIN_TEST_MODE and settings.APP_ENV.strip().lower() not in TEST_MODE_ENVS:
        raise RuntimeError("HEMFIN_TEST_MODE is only allowed when APP_ENV is 'local' or 'test'.")
    base = settings.WEB_BASE_URL.strip().lower()
    if settings.APP_ENV.strip().lower() == "production" and (
        not base or "localhost" in base or "127.0.0.1" in base
    ):
        # Invitation links are built from this, so emails would carry a dead link.
        log.warning("WEB_BASE_URL is unset or points to localhost in production")
    # Fail fast at startup if the DB secret is missing or malformed (names the variable only).
    if not settings.HEMFIN_TEST_MODE:
        db.parse_database_url(settings.require_database_url())
    yield
    await db.dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)
    app = FastAPI(title="HemFin API", version="0.1.0", lifespan=lifespan)

    # Order matters (last added is outermost): errors are caught innermost so the 500
    # still passes through CORS and request-id handling.
    app.add_middleware(UnhandledErrorMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "Retry-After"],
    )
    app.add_middleware(RequestIdMiddleware)
    register_exception_handlers(app)

    @app.get("/health", tags=["health"], summary="Liveness")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get(
        "/health/ready",
        tags=["health"],
        summary="Readiness (checks the database)",
        responses={503: {"description": "Database unavailable", "content": {PROBLEM_JSON: {}}}},
    )
    async def ready() -> JSONResponse:
        try:
            async with db.get_engine().connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception:
            log.warning("database readiness check failed", exc_info=True)
            return problem_response(503, detail="Database is unavailable.")
        return JSONResponse({"status": "ready"})

    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(users_router.router)
    api_v1.include_router(profile_router.router)
    api_v1.include_router(spaces_router.router)
    api_v1.include_router(invitations_router.space_router)
    api_v1.include_router(invitations_router.token_router)
    api_v1.include_router(categories_router.router)
    api_v1.include_router(contracts_router.router)
    api_v1.include_router(dashboard_router.router)
    api_v1.include_router(expenses_router.router)
    api_v1.include_router(income_router.sources_router)
    api_v1.include_router(income_router.entries_router)
    app.include_router(api_v1)
    app.include_router(jobs_router.router)
    setup_telemetry(app)  # no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set
    return app


app = create_app()
