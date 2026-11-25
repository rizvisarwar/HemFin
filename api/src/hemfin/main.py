from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from hemfin.core import db
from hemfin.core.config import get_settings
from hemfin.core.errors import PROBLEM_JSON, problem_response, register_exception_handlers
from hemfin.core.logging import RequestIdMiddleware, configure_logging


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await db.dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)
    app = FastAPI(title="HemFin API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
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
            return problem_response(503, detail="Database is unavailable.")
        return JSONResponse({"status": "ready"})

    api_v1 = APIRouter(prefix="/api/v1")
    # Feature routers are included here by later tickets: api_v1.include_router(...)
    app.include_router(api_v1)
    return app


app = create_app()
