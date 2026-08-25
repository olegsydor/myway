from typing import Any

from pydantic import BaseModel


class GraphNode(BaseModel):
    id: int
    type: str
    label: str
    description: str | None
    attributes: dict[str, Any]


class GraphEdge(BaseModel):
    id: int
    type: str
    source: int
    target: int
    description: str | None
    attributes: dict[str, Any]


class GraphMeta(BaseModel):
    nodes_count: int
    edges_count: int


class GraphResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    meta: GraphMeta
