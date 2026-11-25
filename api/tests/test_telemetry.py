import io
import logging
from functools import partial

import opentelemetry.exporter.otlp.proto.grpc._log_exporter as log_mod
import opentelemetry.exporter.otlp.proto.grpc.metric_exporter as metric_mod
import opentelemetry.exporter.otlp.proto.grpc.trace_exporter as trace_mod
import pytest
from fastapi import FastAPI
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter
from opentelemetry.sdk.metrics.export import ConsoleMetricExporter
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from hemfin.core.telemetry import setup_telemetry, telemetry_enabled


def test_disabled_without_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    assert telemetry_enabled() is False
    assert setup_telemetry(FastAPI()) is False


def test_blank_endpoint_is_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "  ")
    assert setup_telemetry(FastAPI()) is False


def test_enabled_with_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    # Swap the network exporters for in-memory ones so no collector is needed.
    monkeypatch.setattr(log_mod, "OTLPLogExporter", InMemoryLogRecordExporter)
    monkeypatch.setattr(trace_mod, "OTLPSpanExporter", InMemorySpanExporter)
    monkeypatch.setattr(
        metric_mod, "OTLPMetricExporter", partial(ConsoleMetricExporter, out=io.StringIO())
    )
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:4317")

    root = logging.getLogger()
    before = list(root.handlers)
    try:
        assert setup_telemetry(FastAPI()) is True
    finally:
        root.handlers[:] = before
