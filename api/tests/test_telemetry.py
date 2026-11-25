import importlib
import io
import logging
from collections.abc import Callable
from functools import partial

import pytest
from fastapi import FastAPI
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter
from opentelemetry.sdk.metrics.export import ConsoleMetricExporter
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from hemfin.core.telemetry import setup_telemetry, telemetry_enabled

PACKAGES = {
    "grpc": "opentelemetry.exporter.otlp.proto.grpc",
    "http/protobuf": "opentelemetry.exporter.otlp.proto.http",
}


def test_disabled_without_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    assert telemetry_enabled() is False
    assert setup_telemetry(FastAPI()) is False


def test_blank_endpoint_is_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "  ")
    assert setup_telemetry(FastAPI()) is False


def test_unsupported_protocol_disables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4317")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_PROTOCOL", "http/json")
    assert setup_telemetry(FastAPI()) is False


@pytest.mark.parametrize("protocol", [None, "grpc", "http/protobuf"])
def test_enabled_selects_exporter_by_protocol(
    monkeypatch: pytest.MonkeyPatch, protocol: str | None
) -> None:
    # Swap the exporters of the chosen protocol for in-memory ones, so no collector is needed,
    # and record which package was asked for.
    used: list[str] = []
    expected = PACKAGES[protocol or "grpc"]
    fakes = {
        "_log_exporter": ("OTLPLogExporter", InMemoryLogRecordExporter),
        "trace_exporter": ("OTLPSpanExporter", InMemorySpanExporter),
        "metric_exporter": (
            "OTLPMetricExporter",
            partial(ConsoleMetricExporter, out=io.StringIO()),
        ),
    }
    for module, (name, fake) in fakes.items():

        def factory(_fake: Callable[[], object] = fake, _m: str = module) -> object:
            used.append(_m)
            return _fake()

        monkeypatch.setattr(importlib.import_module(f"{expected}.{module}"), name, factory)

    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4317")
    if protocol:
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_PROTOCOL", protocol)
    else:
        monkeypatch.delenv("OTEL_EXPORTER_OTLP_PROTOCOL", raising=False)

    # OpenTelemetry's global tracer/meter/logger providers are once-per-process: the first
    # enabled call in the run wins and later calls only log a warning. That is fine here, because
    # we assert on exporter selection, not on global state. Only the root handlers are restored.
    root = logging.getLogger()
    before = list(root.handlers)
    try:
        assert setup_telemetry(FastAPI()) is True
    finally:
        root.handlers[:] = before
    assert sorted(used) == ["_log_exporter", "metric_exporter", "trace_exporter"]
