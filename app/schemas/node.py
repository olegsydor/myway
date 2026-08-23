from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class NodeCreate(BaseModel):
    node_type_id: int = Field(gt=0)
    display_name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class NodeUpdate(BaseModel):
    node_type_id: int | None = Field(default=None, gt=0)
    display_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )
    description: str | None = None
    properties: dict[str, Any] | None = None


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