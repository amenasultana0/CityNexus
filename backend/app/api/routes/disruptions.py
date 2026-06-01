"""
Community Disruption Reporter — crowd-sourced live disruption feed for Hyderabad.
No auth required. Anonymous reporting with upvoting.
"""

from datetime import datetime, timezone, timedelta
from typing import Any
from math import radians, sin, cos, sqrt, atan2

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import select

from app.api.deps import SessionDep
from app.models import DisruptionReport

router = APIRouter(tags=["community"])

# Auto-expire reports after 6 hours
EXPIRY_HOURS = 6


# ── Request / Response models ─────────────────────────────────

class DisruptionCreate(BaseModel):
    lat: float = Field(ge=17.0, le=18.0)
    lon: float = Field(ge=78.0, le=79.0)
    category: str = Field(..., description="metro|auto|road|flooding|police|accident|other")
    description: str = Field(..., min_length=5, max_length=200)
    location_name: str | None = Field(default=None, max_length=100)


class DisruptionResponse(BaseModel):
    id: int
    lat: float
    lon: float
    category: str
    description: str
    location_name: str | None
    reported_at: datetime
    upvotes: int
    is_active: bool
    minutes_ago: int


class DisruptionsListResponse(BaseModel):
    disruptions: list[DisruptionResponse]
    total: int


# ── Helpers ───────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _to_response(d: DisruptionReport) -> DisruptionResponse:
    now = datetime.now(timezone.utc)
    reported = d.reported_at.replace(tzinfo=timezone.utc) if d.reported_at.tzinfo is None else d.reported_at
    minutes_ago = max(0, int((now - reported).total_seconds() / 60))
    return DisruptionResponse(
        id=d.id,
        lat=d.lat,
        lon=d.lon,
        category=d.category,
        description=d.description,
        location_name=d.location_name,
        reported_at=d.reported_at,
        upvotes=d.upvotes,
        is_active=d.is_active,
        minutes_ago=minutes_ago,
    )


def _expire_old(session: SessionDep) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=EXPIRY_HOURS)
    old = session.exec(
        select(DisruptionReport).where(
            DisruptionReport.is_active == True,
            DisruptionReport.reported_at < cutoff,
        )
    ).all()
    for d in old:
        d.is_active = False
        session.add(d)
    if old:
        session.commit()


# ── Endpoints ─────────────────────────────────────────────────

@router.post("/report", response_model=DisruptionResponse)
def report_disruption(body: DisruptionCreate, session: SessionDep) -> Any:
    _expire_old(session)
    valid_categories = {"metro", "auto", "road", "flooding", "police", "accident", "other"}
    if body.category not in valid_categories:
        raise HTTPException(status_code=422, detail=f"category must be one of {valid_categories}")

    report = DisruptionReport(
        lat=body.lat,
        lon=body.lon,
        category=body.category,
        description=body.description,
        location_name=body.location_name,
        reported_at=datetime.now(timezone.utc),
        upvotes=0,
        is_active=True,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return _to_response(report)


@router.get("/disruptions", response_model=DisruptionsListResponse)
def get_disruptions(
    session: SessionDep,
    lat: float = Query(default=17.385, ge=17.0, le=18.0),
    lon: float = Query(default=78.4867, ge=78.0, le=79.0),
    radius_km: float = Query(default=10.0, ge=0.5, le=50.0),
    category: str | None = Query(default=None),
) -> Any:
    _expire_old(session)

    query = select(DisruptionReport).where(DisruptionReport.is_active == True)
    if category:
        query = query.where(DisruptionReport.category == category)

    all_active = session.exec(query.order_by(DisruptionReport.reported_at.desc())).all()

    # Filter by radius
    nearby = [
        d for d in all_active
        if _haversine_km(lat, lon, d.lat, d.lon) <= radius_km
    ]

    return DisruptionsListResponse(
        disruptions=[_to_response(d) for d in nearby],
        total=len(nearby),
    )


@router.post("/disruptions/{report_id}/upvote", response_model=DisruptionResponse)
def upvote_disruption(report_id: int, session: SessionDep) -> Any:
    report = session.get(DisruptionReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not report.is_active:
        raise HTTPException(status_code=410, detail="Report has expired")
    report.upvotes += 1
    session.add(report)
    session.commit()
    session.refresh(report)
    return _to_response(report)


@router.get("/disruptions/stats")
def disruption_stats(session: SessionDep) -> Any:
    _expire_old(session)
    active = session.exec(
        select(DisruptionReport).where(DisruptionReport.is_active == True)
    ).all()
    by_category: dict[str, int] = {}
    for d in active:
        by_category[d.category] = by_category.get(d.category, 0) + 1
    return {
        "total_active": len(active),
        "by_category": by_category,
    }