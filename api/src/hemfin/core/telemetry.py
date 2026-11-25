"""Opt-in OpenTelemetry. Does nothing unless OTEL_EXPORTER_OTLP_ENDPOINT is set.

The standard OTEL_* env vars (endpoint, headers, service name) configure the exporters. The
protocol comes from OTEL_EXPORTER_OTLP_PROTOCOL: "grpc" (default) or "http/protobuf". Any other
value is logged and leaves telemetry off. Per-signal overrides (OTEL_EXPORTER_OTLP_TRACES_PROTOCOL
and friends) are not supported. Headers may carry credentials, so they are never logged here.

Note: FastAPI instrumentation records the full URL, query string included, on spans. Do not put
secrets (for example invitation tokens) in query strings, or sanitize them before enabling this.

OpenTelemetry provider setters are once-per-process, so this is meant to run once at startup.
"""

import importlib
import logging
import os
from typing import Any

from fastapi import FastAPI

log = logging.getLogger("hemfin.telemetry")


def telemetry_enabled() -> bool:
    return bool(os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip())


_PROTOCOLS = {
    "grpc": "opentelemetry.exporter.otlp.proto.grpc",
    "http/protobuf": "opentelemetry.exporter.otlp.proto.http",
}


def _exporter(package: str, module: str, cls: str) -> Any:
    return getattr(importlib.import_module(f"{package}.{module}"), cls)()


def setup_telemetry(app: FastAPI) -> bool:
    """Instrument the app and export traces/metrics/logs over OTLP. Returns True if enabled."""
    if not telemetry_enabled():
        return False

    protocol = os.environ.get("OTEL_EXPORTER_OTLP_PROTOCOL", "").strip() or "grpc"
    package = _PROTOCOLS.get(protocol)
    if package is None:
        log.warning(
            "Unsupported OTEL_EXPORTER_OTLP_PROTOCOL %r (use grpc or http/protobuf); "
            "telemetry disabled",
            protocol,
        )
        return False

    # Imported lazily so the default path never touches the OTel packages.
    from opentelemetry import metrics, trace
    from opentelemetry._logs import set_logger_provider
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.logging.handler import LoggingHandler
    from opentelemetry.sdk._logs import LoggerProvider
    from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    resource = Resource.create({"service.name": os.environ.get("OTEL_SERVICE_NAME", "hemfin-api")})

    tracer_provider = TracerProvider(resource=resource)
    tracer_provider.add_span_processor(
        BatchSpanProcessor(_exporter(package, "trace_exporter", "OTLPSpanExporter"))
    )
    trace.set_tracer_provider(tracer_provider)

    metrics.set_meter_provider(
        MeterProvider(
            resource=resource,
            metric_readers=[
                PeriodicExportingMetricReader(
                    _exporter(package, "metric_exporter", "OTLPMetricExporter")
                )
            ],
        )
    )

    logger_provider = LoggerProvider(resource=resource)
    logger_provider.add_log_record_processor(
        BatchLogRecordProcessor(_exporter(package, "_log_exporter", "OTLPLogExporter"))
    )
    set_logger_provider(logger_provider)
    logging.getLogger().addHandler(LoggingHandler(logger_provider=logger_provider))

    FastAPIInstrumentor.instrument_app(app, excluded_urls="health")
    log.info("OpenTelemetry enabled")
    return True
