import uuid
from datetime import datetime, timezone

from pydantic import EmailStr
from sqlmodel import Field, Relationship, SQLModel


class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=40)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=40)
    full_name: str | None = Field(default=None, max_length=255)


class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=40)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=40)
    new_password: str = Field(min_length=8, max_length=40)


class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)


class UserPublic(UserBase):
    id: uuid.UUID


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class ItemCreate(ItemBase):
    pass


class ItemUpdate(ItemBase):
    title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


class Message(SQLModel):
    message: str


class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=40)


# ─────────────────────────────────────────────────────────────
# CityNexus Models
# ─────────────────────────────────────────────────────────────

class TransportStop(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255)
    latitude: float
    longitude: float
    stop_type: str = Field(max_length=20)
    zone_name: str | None = Field(default=None, max_length=100)


class AreaContext(SQLModel, table=True):
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
    risk_level: str = Field(default="medium", max_length=20)


class DemandPattern(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    constituency_num: str = Field(index=True, max_length=20)
    hour_of_day: int
    day_of_week: int
    cancel_rate: float
    booking_count: int = 0
    driver_supply: int = 0


class HyderabadZone(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    ac_number: str = Field(unique=True, index=True, max_length=20)
    base_cancel_rate: float
    risk_level: str = Field(default="medium", max_length=20)
    search_to_estimate_rate: float = 0.97
    estimate_to_quote_rate: float = 0.35
    quote_to_booking_rate: float = 0.99
    conversion_rate: float = 0.04
    avg_fare_inr: float = 180.0
    avg_distance_km: float = 9.5


class RidePrediction(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    predicted_risk: str = Field(max_length=20)
    probability: float
    is_raining: bool = False
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class UserSearch(SQLModel, table=True):
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
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    route: str = Field(index=True, max_length=50)
    direction: str = Field(max_length=20)
    source: str = Field(max_length=255)
    destination: str = Field(max_length=255)
    first_bus: str = Field(max_length=20)
    last_bus: str = Field(max_length=20)
    trips_per_day: int = 0
    timetable_json: str = Field(default="[]")
    stops_json: str = Field(default="[]")


# ── Disruption Reporter ───────────────────────────────────────
class DisruptionReport(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    lat: float
    lon: float
    category: str = Field(max_length=50)
    description: str = Field(default="", max_length=300)
    location_name: str | None = Field(default=None, max_length=100)
    reported_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    upvotes: int = Field(default=0)
    is_active: bool = Field(default=True)
    photo_filename: str | None = Field(default=None, max_length=255)
    resolve_votes: int = Field(default=0)          # NEW — consensus resolve


# ── Disruption Comments ───────────────────────────────────────
class DisruptionComment(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    report_id: int = Field(foreign_key="disruptionreport.id", index=True)
    text: str = Field(max_length=200)
    posted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    minutes_ago: int = Field(default=0)