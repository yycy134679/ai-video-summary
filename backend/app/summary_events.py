from __future__ import annotations

import json
from typing import Any

from backend.app.summary_models import SummaryStage


def stage_event(stage: SummaryStage, status: str, message: str) -> str:
    return sse_event("stage", {"stage": stage, "status": status, "message": message})


def sse_event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def dump_model(model: Any) -> dict[str, Any]:
    return model.model_dump(mode="json")
