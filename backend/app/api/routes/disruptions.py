"""
Community Disruption Reporter — crowd-sourced live disruption feed for Hyderabad.
No auth required. Anonymous reporting with upvoting, comments, and consensus resolve.
Photos stored in /app/uploads/disruptions/ inside the container.
"""

import uuid
from datetime import datetime, timezone
from typing import Any
from math import radians, sin, cos, sqrt, atan2
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from sqlmodel import select

from app.api.deps import SessionDep
from app.core.config import settings
from app.models import DisruptionReport, DisruptionComment

router = APIRouter(tags=["community"])

# Local fallback directory (used only if Supabase is not configured)
UPLOAD_DIR = Path("/app/uploads/disruptions")

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB
RESOLVE_THRESHOLD = 5               # votes needed to auto-resolve

PHOTO_REQUIRED_CATEGORIES = {
    "road_block", "pothole", "construction", "signal_down",
    "accident", "vehicle_fire", "flooding", "waterlogging", "visibility",
}

VALID_CATEGORIES = {
    "metro_issue", "bus_delay", "auto_strike", "cab_surge", "mmts_issue",
    "road_block", "pothole", "construction", "signal_down",
    "accident", "police_naaka", "vehicle_fire", "vip_movement",
    "flooding", "waterlogging", "visibility", "power_outage",
    "procession", "religious", "stadium",
    "other",
}


# ── Response models ───────────────────────────────────────────

class CommentResponse(BaseModel):
    id: int
    report_id: int
    text: str
    posted_at: datetime
    minutes_ago: int


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
    photo_url: str | None
    comment_count: int
    resolve_votes: int


class DisruptionsListResponse(BaseModel):
    disruptions: list[DisruptionResponse]
    total: int


class CommentsListResponse(BaseModel):
    comments: list[CommentResponse]
    total: int


# ── Helpers ───────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _minutes_since(dt: datetime) -> int:
    now = datetime.now(timezone.utc)
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    return max(0, int((now - aware).total_seconds() / 60))


def _to_response(d: DisruptionReport, comment_count: int = 0) -> DisruptionResponse:
    if d.photo_filename is None:
        photo_url = None
    elif d.photo_filename.startswith("http"):
        photo_url = d.photo_filename          # Supabase public URL stored directly
    else:
        photo_url = f"/uploads/disruptions/{d.photo_filename}"  # legacy local path
    return DisruptionResponse(
        id=d.id,
        lat=d.lat,
        lon=d.lon,
        category=d.category,
        description=d.description or "",
        location_name=d.location_name,
        reported_at=d.reported_at,
        upvotes=d.upvotes,
        is_active=d.is_active,
        minutes_ago=_minutes_since(d.reported_at),
        photo_url=photo_url,
        comment_count=comment_count,
        resolve_votes=d.resolve_votes,
    )


def _to_comment_response(c: DisruptionComment) -> CommentResponse:
    return CommentResponse(
        id=c.id,
        report_id=c.report_id,
        text=c.text,
        posted_at=c.posted_at,
        minutes_ago=_minutes_since(c.posted_at),
    )


async def _save_photo(photo: UploadFile) -> str:
    if photo.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Photo must be JPEG, PNG, or WebP. Got: {photo.content_type}",
        )
    contents = await photo.read()
    if len(contents) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=422, detail="Photo must be under 5 MB")

    ext = photo.filename.rsplit(".", 1)[-1].lower() if photo.filename and "." in photo.filename else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"

    supabase_ready = (
        settings.SUPABASE_URL
        and settings.SUPABASE_SERVICE_KEY
        and not settings.SUPABASE_SERVICE_KEY.startswith("your-")
    )
    if supabase_ready:
        # Upload to Supabase Storage
        upload_url = f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_BUCKET}/{filename}"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                upload_url,
                content=contents,
                headers={
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                    "Content-Type": photo.content_type or "image/jpeg",
                },
            )
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=500, detail=f"Photo upload failed: {resp.text}")
        # Return full public URL — stored directly in photo_filename column
        return f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_BUCKET}/{filename}"
    else:
        # Fallback: local disk
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (UPLOAD_DIR / filename).write_bytes(contents)
        return filename


# ── Disruption endpoints ──────────────────────────────────────

@router.post("/report", response_model=DisruptionResponse)
async def report_disruption(
    session: SessionDep,
    lat: float = Form(..., ge=17.0, le=18.0),
    lon: float = Form(..., ge=78.0, le=79.0),
    category: str = Form(...),
    description: str = Form(default=""),
    location_name: str = Form(..., min_length=2, max_length=100),
    photo: UploadFile | None = File(default=None),
) -> Any:
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Invalid category: {category}")

    location_name = location_name.strip()
    if not location_name:
        raise HTTPException(status_code=422, detail="location_name is required")

    description = description.strip()
    if category == "other" and not description:
        raise HTTPException(status_code=422, detail="description is required for category 'other'")

    if category in PHOTO_REQUIRED_CATEGORIES:
        if photo is None or not photo.filename:
            raise HTTPException(
                status_code=422,
                detail=f"A photo is required for category '{category}'",
            )

    photo_filename: str | None = None
    if photo and photo.filename:
        photo_filename = await _save_photo(photo)

    report = DisruptionReport(
        lat=lat, lon=lon, category=category,
        description=description, location_name=location_name,
        reported_at=datetime.now(timezone.utc),
        upvotes=0, is_active=True,
        photo_filename=photo_filename,
        resolve_votes=0,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return _to_response(report, comment_count=0)


@router.get("/disruptions", response_model=DisruptionsListResponse)
def get_disruptions(
    session: SessionDep,
    lat: float = Query(default=17.385, ge=17.0, le=18.0),
    lon: float = Query(default=78.4867, ge=78.0, le=79.0),
    radius_km: float = Query(default=10.0, ge=0.5, le=50.0),
    category: str | None = Query(default=None),
) -> Any:
    query = select(DisruptionReport).where(DisruptionReport.is_active == True)
    if category:
        if category not in VALID_CATEGORIES:
            raise HTTPException(status_code=422, detail=f"Invalid category filter: {category}")
        query = query.where(DisruptionReport.category == category)

    all_active = session.exec(query.order_by(DisruptionReport.reported_at.desc())).all()

    # Filter by radius, then sort by upvotes descending (most popular first)
    nearby = sorted(
        [d for d in all_active if _haversine_km(lat, lon, d.lat, d.lon) <= radius_km],
        key=lambda d: d.upvotes,
        reverse=True,
    )

    # Fetch comment counts in one query — no N+1
    report_ids = [d.id for d in nearby]
    comment_counts: dict[int, int] = {}
    if report_ids:
        all_comments = session.exec(
            select(DisruptionComment).where(DisruptionComment.report_id.in_(report_ids))
        ).all()
        for c in all_comments:
            comment_counts[c.report_id] = comment_counts.get(c.report_id, 0) + 1

    return DisruptionsListResponse(
        disruptions=[_to_response(d, comment_counts.get(d.id, 0)) for d in nearby],
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
    count = session.exec(
        select(DisruptionComment).where(DisruptionComment.report_id == report_id)
    ).all()
    return _to_response(report, len(count))


@router.post("/disruptions/{report_id}/resolve-vote", response_model=DisruptionResponse)
def resolve_vote(report_id: int, session: SessionDep) -> Any:
    """
    Consensus-based resolve. Each call increments resolve_votes by 1.
    Once 5 people vote, the report auto-resolves and disappears from the feed.
    Frontend tracks voted IDs in localStorage to prevent repeat votes.
    """
    report = session.get(DisruptionReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not report.is_active:
        raise HTTPException(status_code=410, detail="Report is already resolved")

    report.resolve_votes += 1
    if report.resolve_votes >= RESOLVE_THRESHOLD:
        report.is_active = False

    session.add(report)
    session.commit()
    session.refresh(report)

    count = session.exec(
        select(DisruptionComment).where(DisruptionComment.report_id == report_id)
    ).all()
    return _to_response(report, len(count))


@router.get("/disruptions/stats")
def disruption_stats(session: SessionDep) -> Any:
    active = session.exec(
        select(DisruptionReport).where(DisruptionReport.is_active == True)
    ).all()
    by_category: dict[str, int] = {}
    for d in active:
        by_category[d.category] = by_category.get(d.category, 0) + 1
    return {
        "total_active": len(active),
        "by_category": by_category,
        "valid_categories": sorted(VALID_CATEGORIES),
        "photo_required_categories": sorted(PHOTO_REQUIRED_CATEGORIES),
        "resolve_threshold": RESOLVE_THRESHOLD,
    }


# ── Comment endpoints ─────────────────────────────────────────

@router.get("/disruptions/{report_id}/comments", response_model=CommentsListResponse)
def get_comments(report_id: int, session: SessionDep) -> Any:
    report = session.get(DisruptionReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    comments = session.exec(
        select(DisruptionComment)
        .where(DisruptionComment.report_id == report_id)
        .order_by(DisruptionComment.posted_at.asc())
    ).all()
    return CommentsListResponse(
        comments=[_to_comment_response(c) for c in comments],
        total=len(comments),
    )


@router.post("/disruptions/{report_id}/comments", response_model=CommentResponse)
def post_comment(
    report_id: int,
    session: SessionDep,
    text: str = Form(..., min_length=1, max_length=200),
) -> Any:
    report = session.get(DisruptionReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not report.is_active:
        raise HTTPException(status_code=410, detail="Report is resolved — comments are closed")

    text = text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Comment cannot be empty")

    comment = DisruptionComment(
        report_id=report_id,
        text=text,
        posted_at=datetime.now(timezone.utc),
        minutes_ago=0,
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return _to_comment_response(comment)


@router.delete("/disruptions/{report_id}/comments/{comment_id}")
def delete_comment(report_id: int, comment_id: int, session: SessionDep) -> Any:
    comment = session.get(DisruptionComment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.report_id != report_id:
        raise HTTPException(status_code=400, detail="Comment doesn't belong to this report")
    session.delete(comment)
    session.commit()
    return {"ok": True}