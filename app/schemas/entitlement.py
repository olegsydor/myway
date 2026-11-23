from datetime import datetime
from typing import Literal

from pydantic import BaseModel

Plan = Literal["free", "pro"]
Resource = Literal["nodes", "annotations_per_layout", "layouts"]


class Limits(BaseModel):
    nodes: int | None
    annotations_per_layout: int | None
    layouts: int


class Usage(BaseModel):
    nodes: int
    layouts: int


class Entitlements(BaseModel):
    plan: Plan
    source: Literal["default", "manual", "early_tester"]
    starts_at: datetime | None
    expires_at: datetime | None
    limits: Limits
    usage: Usage


class Violation(BaseModel):
    resource: Resource
    limit: int
    attempted: int
    layout_id: int | None = None
    layout_name: str | None = None


class Eligibility(BaseModel):
    allowed: bool
    violations: list[Violation]


class PlanLimitError(Violation):
    code: Literal["plan_limit_exceeded"] = "plan_limit_exceeded"
    plan: Plan = "free"
    current: int
