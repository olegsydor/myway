from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class NodeCreate(BaseModel):
    node_type_id: int
    display_name: str
    description: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class NodeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    node_type_id: int
    display_name: str
    description: str | None
    properties: dict[str, Any]
    created_at: datetime
    updated_at: datetime
