from datetime import datetime
import re
from uuid import UUID
from typing import Annotated, Literal

from pydantic import (
    BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_serializer, model_validator,
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


AnnotationColor = Literal["gray", "blue", "green", "yellow", "red", "purple"]


class AnnotationBase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    x: Coordinate
    y: Coordinate
    color: AnnotationColor


class ShapeAnnotation(AnnotationBase):
    width: Annotated[float, Field(strict=True, gt=0, allow_inf_nan=False)]
    height: Annotated[float, Field(strict=True, gt=0, allow_inf_nan=False)]
    fill: Literal["none", "light", "medium"]
    border: Literal["thin", "normal", "thick"]


    name: Annotated[str, StringConstraints(strict=True, max_length=200)] | None = None
    description: Annotated[str, StringConstraints(strict=True, max_length=2000)] | None = None

    @field_validator("name", "description", mode="before")
    @classmethod
    def normalize_metadata(cls, value, info):
        if not isinstance(value, str):
            return value
        if "\x00" in value or any(0xD800 <= ord(char) <= 0xDFFF for char in value):
            raise ValueError("Annotation metadata must be valid Unicode without NUL")
        if info.field_name == "name":
            value = re.sub(r"[\r\n\v\f\x1c-\x1e\x85\u2028\u2029]+", " ", value)
        return value.strip() or None

    @model_serializer(mode="wrap")
    def serialize_metadata(self, handler):
        data = handler(self)
        for field in ("name", "description"):
            if data.get(field) is None:
                data.pop(field, None)
        return data


class RectangleAnnotation(ShapeAnnotation):
    kind: Literal["rectangle"]


class EllipseAnnotation(ShapeAnnotation):
    kind: Literal["ellipse"]


class TextAnnotation(AnnotationBase):
    kind: Literal["text"]
    text: Annotated[str, StringConstraints(strict=True, min_length=1, max_length=2000)]
    size: Literal["small", "medium", "large"]

    @model_validator(mode="after")
    def nonempty_text(self):
        if not self.text.strip():
            raise ValueError("Annotation text must not be whitespace-only")
        return self


Annotation = Annotated[RectangleAnnotation | EllipseAnnotation | TextAnnotation, Field(discriminator="kind")]


class WorkspaceSnapshot(PositionSnapshot):
    annotations: list[Annotation] = Field(max_length=2000)

    @model_validator(mode="after")
    def unique_annotations(self):
        ids = [annotation.id for annotation in self.annotations]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate annotation IDs in workspace snapshot")
        return self


class LayoutCreate(WorkspaceSnapshot):
    annotations: list[Annotation] = Field(default_factory=list, max_length=2000)
    name: LayoutName
    is_default: bool = Field(default=False, strict=True)
    is_initial: bool = Field(default=False, strict=True)


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
    annotations: list[Annotation]
