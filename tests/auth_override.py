"""Compatibility helper for pre-auth unit tests only. No production bypass exists."""
from app.main import app
from app.dependencies.auth import get_current_user
from app.models import User

class AuthOverride:
    def __init__(self):
        self._id = None
    @property
    def TEST_USER_ID(self):
        return self._id
    @TEST_USER_ID.setter
    def TEST_USER_ID(self, value):
        self._id = value
        if value is None:
            app.dependency_overrides.pop(get_current_user, None)
        else:
            app.dependency_overrides[get_current_user] = lambda: User(id=value)

auth = AuthOverride()
