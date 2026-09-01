from pydantic import BaseModel, ConfigDict


class EdgeTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
