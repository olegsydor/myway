from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class EdgeCreate(BaseModel):
    source_node_id: int
    target_node_id: int
    edge_type_id: int
    description: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class EdgeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    source_node_id: int
    target_node_id: int
    edge_type_id: int
    description: str | None
    properties: dict[str, Any]
    created_at: datetime
    updated_at: datetime
