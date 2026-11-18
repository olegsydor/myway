from pydantic import BaseModel, ConfigDict, Field, field_validator
from email_validator import validate_email, EmailNotValidError

class EmailInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(max_length=320)
    @field_validator("email")
    @classmethod
    def email_valid(cls, value):
        try:
            normalized = validate_email(value.strip(), check_deliverability=False).normalized.lower()
            if len(normalized) > 320:
                raise ValueError("Email is too long")
            return normalized
        except EmailNotValidError:
            raise ValueError("Enter a valid email address")

class RegisterInput(EmailInput):
    password: str = Field(min_length=15, max_length=128)
    display_name: str = Field(min_length=1, max_length=255)
    @field_validator("display_name")
    @classmethod
    def name_nonblank(cls, value):
        if not value.strip():
            raise ValueError("Enter your name")
        return value.strip()

class LoginInput(EmailInput):
    password: str = Field(min_length=1, max_length=128)

class TokenPasswordInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=32, max_length=128)
    password: str = Field(min_length=15, max_length=128)

class CurrentPasswordInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(min_length=1, max_length=128)


class ChangePasswordInput(CurrentPasswordInput):
    password: str = Field(min_length=15, max_length=128)
