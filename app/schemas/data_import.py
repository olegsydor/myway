import json
from graphlib import CycleError, TopologicalSorter
from math import isfinite
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.layout import LayoutName, NodeId, WorkspaceSnapshot


class ImportRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: NodeId
    created_at: AwareDatetime
    updated_at: AwareDatetime


class ImportGraphRecord(ImportRecord):
    type: Annotated[str, StringConstraints(min_length=1)]
    description: str | None
    properties: dict[str, object]


class ImportNode(ImportGraphRecord):
    display_name: Annotated[str, StringConstraints(min_length=1, max_length=255)]


class ImportEdge(ImportGraphRecord):
    source_node_id: NodeId
    target_node_id: NodeId


class ImportLayout(ImportRecord, WorkspaceSnapshot):
    name: LayoutName
    is_default: bool


class DataImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1, 2]
    exported_at: AwareDatetime
    nodes: list[ImportNode]
    edges: list[ImportEdge]
    layouts: list[ImportLayout]

    @model_validator(mode="after")
    def validate_graph(self):
        for records in (self.nodes, self.edges, self.layouts):
            if len({record.id for record in records}) != len(records):
                raise ValueError("Duplicate record IDs")

        nodes = {node.id for node in self.nodes}
        graph = TopologicalSorter()
        edge_keys = set()
        for edge in self.edges:
            source, target = edge.source_node_id, edge.target_node_id
            if source not in nodes or target not in nodes:
                raise ValueError("Edge references a missing node")
            key = (source, target, edge.type)
            if key in edge_keys:
                raise ValueError("Duplicate edge")
            edge_keys.add(key)
            graph.add(target, source)
        try:
            graph.prepare()
        except CycleError as exc:
            raise ValueError("Graph contains a directed cycle") from exc

        if sum(layout.is_default for layout in self.layouts) > 1:
            raise ValueError("Multiple default layouts")
        if len({layout.name.lower() for layout in self.layouts}) != len(self.layouts):
            raise ValueError("Duplicate layout names")
        for layout in self.layouts:
            # A saved layout can predate new graph nodes.
            if any(position.node_id not in nodes for position in layout.positions):
                raise ValueError("Layout position references a missing node")
        return self


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON object key")
        result[key] = value
    return result


def parse_data_import(raw: bytes | bytearray) -> DataImport:
    # Check JSON details that the schema parser or PostgreSQL might silently
    # normalize or reject, including nested properties.
    document = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object)
    if isinstance(document, dict) and "schema_version" in document:
        version = document["schema_version"]
        if type(version) is not int or version not in (1, 2):
            raise ValueError("Unsupported export schema version")
        if version == 1 and isinstance(document.get("layouts"), list):
            for layout in document["layouts"]:
                if not isinstance(layout, dict) or not isinstance(layout.get("annotations"), list):
                    continue
                for annotation in layout["annotations"]:
                    if isinstance(annotation, dict) and (
                        annotation.get("kind") == "ellipse" or {"name", "description"} & annotation.keys()
                    ):
                        raise ValueError("Shape metadata and ellipse require export schema version 2")
    pending = [document]
    while pending:
        value = pending.pop()
        if isinstance(value, dict):
            pending.extend(value.keys())
            pending.extend(value.values())
        elif isinstance(value, list):
            pending.extend(value)
        elif isinstance(value, str):
            value.encode("utf-8")
            if "\x00" in value:
                raise ValueError("JSON strings cannot contain NUL characters")
        elif isinstance(value, float) and not isfinite(value):
            raise ValueError("JSON numbers must be finite")

    return DataImport.model_validate_json(raw, strict=True)
