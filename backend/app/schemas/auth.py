from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRead(BaseModel):
    """Represent the authenticated owner."""

    id: UUID
    email: EmailStr
    display_name: str | None = None
    is_demo: bool = False
    timezone: str
    units: str

    model_config = ConfigDict(from_attributes=True)


class SetupOwnerRequest(BaseModel):
    """Represent the owner setup request."""

    email: EmailStr
    password: str = Field(min_length=10)


class LoginRequest(BaseModel):
    """Represent a login request."""

    email: EmailStr
    password: str = Field(min_length=1)


class ChangePasswordRequest(BaseModel):
    """Represent a password change request."""

    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=10)
