from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic_core import PydanticCustomError

AVATAR_ICON_IDS = {
    "runner_route",
    "stopwatch",
    "heart_rate",
    "running_shoes",
    "trail_path",
    "water_bottle",
    "route_map",
    "calories_flame",
    "goal_target",
    "medal",
    "music_headphones",
    "trophy",
    "calendar_check",
    "night_run",
    "weather",
    "smartwatch",
    "badge_check",
    "strength",
}
AVATAR_IMAGE_PREFIXES = (
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/jpg;base64,",
    "data:image/webp;base64,",
)
AVATAR_IMAGE_MAX_BYTES = 1_500_000
AVATAR_IMAGE_MAX_BASE64_LENGTH = ((AVATAR_IMAGE_MAX_BYTES + 2) // 3) * 4
AVATAR_IMAGE_MAX_LENGTH = (
    max(len(prefix) for prefix in AVATAR_IMAGE_PREFIXES) + AVATAR_IMAGE_MAX_BASE64_LENGTH
)


def validate_avatar_image_data_url(value: str | None) -> str | None:
    """Validate optional avatar image data URLs."""
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) > AVATAR_IMAGE_MAX_LENGTH:
        raise PydanticCustomError("avatar_image_too_large", "avatar image is too large")
    if not cleaned.lower().startswith(AVATAR_IMAGE_PREFIXES):
        raise PydanticCustomError(
            "avatar_image_invalid",
            "avatar image must be a PNG, JPEG, or WebP data URL",
        )
    return cleaned


class HeartRateZone(BaseModel):
    """Represent one heart-rate zone boundary."""

    name: str
    min_hr: int = Field(ge=1, le=260)
    max_hr: int = Field(ge=1, le=260)

    @model_validator(mode="after")
    def validate_bounds(self) -> "HeartRateZone":
        """Validate that zone bounds are ordered."""
        if self.max_hr < self.min_hr:
            raise ValueError("max_hr must be greater than or equal to min_hr")
        return self


class HeartRateZoneSetCreate(BaseModel):
    """Represent a new dated HR zone set."""

    name: str = Field(min_length=1, max_length=255)
    effective_from: date
    zones: list[HeartRateZone]

    @field_validator("zones")
    @classmethod
    def validate_zone_count(cls, zones: list[HeartRateZone]) -> list[HeartRateZone]:
        """Validate that exactly five zones are provided."""
        if len(zones) != 5:
            raise ValueError("exactly five heart-rate zones are required")
        previous_max = 0
        for zone in zones:
            if zone.min_hr <= previous_max:
                raise ValueError("heart-rate zones must be ordered and non-overlapping")
            previous_max = zone.max_hr
        return zones


class HeartRateZoneSetRead(HeartRateZoneSetCreate):
    """Represent a stored HR zone set."""

    id: UUID

    model_config = ConfigDict(from_attributes=True)


class HeartRateRecomputeResponse(BaseModel):
    """Represent the result of recalculating HR-based metrics."""

    recomputed_activities: int
    remaining_unknown_activities: int
    activities_without_effective_zones: int = 0
    earliest_activity_without_effective_zones: date | None = None


class PaceZone(BaseModel):
    """Represent one pace preference zone."""

    name: str = Field(min_length=1, max_length=64)
    min_pace_s_per_km: int = Field(ge=1, le=3600)
    max_pace_s_per_km: int = Field(ge=1, le=3600)

    @model_validator(mode="after")
    def validate_pace_bounds(self) -> "PaceZone":
        """Validate that pace bounds are ordered."""
        if self.max_pace_s_per_km < self.min_pace_s_per_km:
            raise ValueError("max_pace_s_per_km must be greater than or equal to min_pace_s_per_km")
        return self


class UserPreferenceRead(BaseModel):
    """Represent owner UI preferences."""

    locale: str = "cs-CZ"
    dashboard_mode: str = "advanced"
    favorite_template_ids: list[str] = Field(default_factory=list)
    recent_template_ids: list[str] = Field(default_factory=list)
    pace_zones: list[PaceZone] = Field(default_factory=list)
    elevation_correction_enabled: bool = False
    elevation_correction_mode: str = "only_when_zero"
    elevation_provider_url: str | None = None
    avatar_icon: str | None = None
    avatar_image_data_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class UserPreferenceUpdate(BaseModel):
    """Represent editable owner UI preferences."""

    locale: str | None = Field(default=None, min_length=2, max_length=16)
    dashboard_mode: str | None = None
    favorite_template_ids: list[str] | None = None
    recent_template_ids: list[str] | None = None
    pace_zones: list[PaceZone] | None = None
    elevation_correction_enabled: bool | None = None
    elevation_correction_mode: str | None = None
    elevation_provider_url: str | None = Field(default=None, max_length=512)
    avatar_icon: str | None = Field(default=None, max_length=64)
    avatar_image_data_url: str | None = Field(default=None, max_length=AVATAR_IMAGE_MAX_LENGTH)

    @field_validator("locale")
    @classmethod
    def validate_locale(cls, value: str | None) -> str | None:
        """Validate application language preference."""
        if value is not None and value not in {"cs-CZ", "en-US"}:
            raise ValueError("locale must be cs-CZ or en-US")
        return value

    @field_validator("dashboard_mode")
    @classmethod
    def validate_dashboard_mode(cls, value: str | None) -> str | None:
        """Validate dashboard mode preference."""
        if value is not None and value not in {"simple", "advanced"}:
            raise ValueError("dashboard_mode must be simple or advanced")
        return value

    @field_validator("elevation_correction_mode")
    @classmethod
    def validate_elevation_correction_mode(cls, value: str | None) -> str | None:
        """Validate elevation correction mode preference."""
        if value is not None and value not in {"only_when_zero", "always"}:
            raise ValueError("elevation_correction_mode must be only_when_zero or always")
        return value

    @field_validator("elevation_provider_url")
    @classmethod
    def normalize_elevation_provider_url(cls, value: str | None) -> str | None:
        """Normalize blank elevation provider URLs to null."""
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("avatar_icon")
    @classmethod
    def validate_avatar_icon(cls, value: str | None) -> str | None:
        """Validate selected predefined avatar icon."""
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        if cleaned not in AVATAR_ICON_IDS:
            raise PydanticCustomError(
                "avatar_icon_invalid",
                "avatar_icon must be one of the predefined avatar icons",
            )
        return cleaned

    @field_validator("avatar_image_data_url")
    @classmethod
    def validate_avatar_image(cls, value: str | None) -> str | None:
        """Validate uploaded avatar image data."""
        return validate_avatar_image_data_url(value)


class ElevationRecomputeResponse(BaseModel):
    """Represent the result of recalculating GPS-based elevation."""

    recomputed_activities: int
    skipped_activities: int
    failed_activities: int
