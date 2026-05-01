from fastapi import APIRouter

from app.api.routes import items, login, private, rides, users, utils, weather_routes, transport, commute
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(rides.router, prefix="/rides")
api_router.include_router(weather_routes.router, prefix="/weather")
api_router.include_router(transport.router, prefix="/transport")
api_router.include_router(commute.router, prefix="/commute")


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
