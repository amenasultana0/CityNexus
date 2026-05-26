from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pydantic.networks import EmailStr
import httpx

from app.api.deps import get_current_active_superuser
from app.models import Message
from app.utils import generate_test_email, send_email

router = APIRouter(prefix="/utils", tags=["utils"])


class GeocodedLocation(BaseModel):
    lat: float
    lon: float


@router.get("/geocode/")
async def geocode(location: str) -> GeocodedLocation:
    """
    Proxy geocoding through backend to bypass CORS.
    Uses Nominatim OpenStreetMap API.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": f"{location},Hyderabad",
                    "format": "json",
                    "limit": 1,
                },
                headers={"User-Agent": "CityNexus/1.0"},
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
            
            if not data or len(data) == 0:
                raise HTTPException(status_code=404, detail=f"Could not find location: {location}")
            
            result = data[0]
            return GeocodedLocation(
                lat=float(result["lat"]),
                lon=float(result["lon"]),
            )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"Geocoding service error: {str(e)}")


@router.post(
    "/test-email/",
    dependencies=[Depends(get_current_active_superuser)],
    status_code=201,
)
def test_email(email_to: EmailStr) -> Message:
    """
    Test emails.
    """
    email_data = generate_test_email(email_to=email_to)
    send_email(
        email_to=email_to,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    return Message(message="Test email sent")


@router.get("/health-check/")
async def health_check() -> bool:
    return True
