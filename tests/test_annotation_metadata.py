import json
from copy import deepcopy
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.data_import import parse_data_import
from app.schemas.layout import WorkspaceSnapshot


def shape(kind="ellipse", **extra):
    return {"id": str(uuid4()), "kind": kind, "x": 1, "y": 2, "color": "blue",
            "width": 50, "height": 30, "fill": "light", "border": "normal", **extra}


def test_annotation_metadata_normalizes_and_round_trips_without_adding_empty_keys():
    annotations = [shape(name="  Group\r\n21 ", description="  First\nSecond  "),
                   shape("rectangle", name="\u0085 ", description=None)]
    data = WorkspaceSnapshot.model_validate({"positions": [], "annotations": annotations})
    ellipse, old_rectangle = data.model_dump(mode="json")["annotations"]
    assert ellipse == {**annotations[0], "name": "Group 21", "description": "First\nSecond"}
    assert old_rectangle == {k: v for k, v in annotations[1].items() if k not in ("name", "description")}


@pytest.mark.parametrize("patch", [
    {"name": "🌻" * 201}, {"description": "a" * 2001}, {"name": 4},
    {"name": "A\x00B"}, {"description": "\ud800"}, {"width": 0},
])
def test_bad_shape_fields_are_rejected(patch):
    with pytest.raises(ValidationError):
        WorkspaceSnapshot.model_validate({"positions": [], "annotations": [shape(**patch)]})


def test_backup_parser_reads_v1_and_v2_and_validates_before_normalizing():
    date = "2026-11-20T00:00:00Z"
    document = {"schema_version": 1, "exported_at": date, "nodes": [], "edges": [], "layouts": [{
        "id": 1, "created_at": date, "updated_at": date, "name": "Main", "is_default": True,
        "positions": [], "annotations": [shape("rectangle")],
    }]}
    parse = lambda data: parse_data_import(json.dumps(data).encode("utf-8"))
    assert parse(document).layouts[0].annotations[0].kind == "rectangle"
    new = deepcopy(document)
    new["layouts"][0]["annotations"].append(shape(name="Роки", description="🌻"))
    with pytest.raises(ValueError):
        parse(new)
    new["schema_version"] = 2
    assert parse(new).layouts[0].annotations[1].name == "Роки"
    document["layouts"][0]["annotations"][0]["name"] = None
    with pytest.raises(ValueError):
        parse(document)
