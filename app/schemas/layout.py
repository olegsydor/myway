from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel, ConfigDict, Field, StringConstraints, model_validator,
)

LayoutName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
NodeId = Annotated[int, Field(strict=True, gt=0, le=9223372036854775807)]
Coordinate = Annotated[float, Field(strict=True, allow_inf_nan=False)]


class Position(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    node_id: NodeId
    x: Coordinate
    y: Coordinate


class PositionSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    positions: list[Position]

    @model_validator(mode="after")
    def unique_nodes(self):
        ids = [position.node_id for position in self.positions]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate node IDs in position snapshot")
        return self


class LayoutCreate(PositionSnapshot):
    name: LayoutName
    is_default: bool = Field(default=False, strict=True)


class LayoutUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: LayoutName | None = None
    is_default: Literal[True] | None = None

    @model_validator(mode="after")
    def valid_changes(self):
        if not self.model_fields_set:
            raise ValueError("Provide name or is_default=true")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Metadata fields cannot be null")
        return self


class LayoutRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    is_default: bool
    created_at: datetime
    updated_at: datetime


class LayoutDetail(LayoutRead):
    positions: list[Position]
