import uuid

from pydantic import EmailStr
from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=40)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=40)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=40)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=40)
    new_password: str = Field(min_length=8, max_length=40)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(ItemBase):
    title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=40)


# ─────────────────────────────────────────────────────────────
# CityNexus Models — DO NOT modify models above this line
# ─────────────────────────────────────────────────────────────

from datetime import datetime, timezone  # noqa: E402


class TransportStop(SQLModel, table=True):
    """Metro, MMTS, and bus stops across Hyderabad."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255)
    latitude: float
    longitude: float
    stop_type: str = Field(max_length=20)   # metro | bus | mmts
    zone_name: str | None = Field(default=None, max_length=100)


class AreaContext(SQLModel, table=True):
    """GIS features for the 15 operational Hyderabad zones."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    zone_name: str = Field(unique=True, index=True, max_length=100)
    latitude: float
    longitude: float
    metro_count_1km: int = 0
    bus_stop_count_1km: int = 0
    traffic_chokepoint_nearby: bool = False
    commercial_density_1km: int = 0
    is_flood_prone: bool = False
    nearest_metro_distance_km: float = 0.0
    risk_level: str = Field(default="medium", max_length=20)  # medium | high


class DemandPattern(SQLModel, table=True):
    """Hourly demand and cancellation patterns per Hyderabad constituency."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    constituency_num: str = Field(index=True, max_length=20)
    hour_of_day: int       # 0–23
    day_of_week: int       # 0=Mon … 6=Sun
    cancel_rate: float
    booking_count: int = 0
    driver_supply: int = 0


class HyderabadZone(SQLModel, table=True):
    """Constituency-level calibration data from Hyderabad funnel."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    ac_number: str = Field(unique=True, index=True, max_length=20)
    base_cancel_rate: float
    risk_level: str = Field(default="medium", max_length=20)  # medium | high
    search_to_estimate_rate: float = 0.97
    estimate_to_quote_rate: float = 0.35
    quote_to_booking_rate: float = 0.99
    conversion_rate: float = 0.04
    avg_fare_inr: float = 180.0
    avg_distance_km: float = 9.5


class RidePrediction(SQLModel, table=True):
    """Persisted record of each cancellation risk prediction."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    predicted_risk: str = Field(max_length=20)   # medium | high
    probability: float
    is_raining: bool = False
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class UserSearch(SQLModel, table=True):
    """Log of user journey searches for analytics."""
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    origin_name: str | None = Field(default=None, max_length=255)
    dest_name: str | None = Field(default=None, max_length=255)
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    recommended_mode: str | None = Field(default=None, max_length=50)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class BusRoute(SQLModel, table=True):
    """
    Scraped Hyderabad bus route schedule data from hyderabadcitybus.in.
    One row per direction — "forward" and "return" stored separately.
    Populated by backend/app/scripts/scrape_tsrtc.py — NOT real-time.
    """

    __tablename__ = "busroute"
    __table_args__ = (
        UniqueConstraint("route", "direction", name="uq_busroute_route_direction"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    route: str = Field(index=True, max_length=20)               # e.g. "8A"
    direction: str = Field(max_length=10)                        # "forward" | "return"
    source: str | None = Field(default=None, max_length=255)
    destination: str | None = Field(default=None, max_length=255)
    first_bus: str | None = Field(default=None, max_length=10)  # HH:MM (24h)
    last_bus: str | None = Field(default=None, max_length=10)   # HH:MM (24h)
    trips_per_day: int | None = Field(default=None)
    timetable_json: str | None = Field(default=None)             # JSON array of HH:MM departures
    stops_json: str | None = Field(default=None)                 # JSON array of stop names
    last_updated: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
