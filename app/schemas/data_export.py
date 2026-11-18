from datetime import datetime
from typing import Any, Literal

from pydantic import AliasPath, BaseModel, ConfigDict, Field

from app.schemas.layout import LayoutDetail


class ExportRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    description: str | None
    properties: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ExportNode(ExportRecord):
    type: str = Field(validation_alias=AliasPath("node_type", "code"))
    display_name: str


class ExportEdge(ExportRecord):
    type: str = Field(validation_alias=AliasPath("edge_type", "code"))
    source_node_id: int
    target_node_id: int


class DataExport(BaseModel):
    schema_version: Literal[1] = 1
    exported_at: datetime
    nodes: list[ExportNode]
    edges: list[ExportEdge]
    layouts: list[LayoutDetail]
