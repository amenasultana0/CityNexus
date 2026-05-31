export function buildUberUrl(
  pickup: { lat: number; lng: number; name: string },
  dropoff: { lat: number; lng: number; name: string }
): string {
  const params = new URLSearchParams({
    action: "setPickup",
    "pickup[latitude]": pickup.lat.toString(),
    "pickup[longitude]": pickup.lng.toString(),
    "pickup[nickname]": pickup.name,

    "dropoff[latitude]": dropoff.lat.toString(),
    "dropoff[longitude]": dropoff.lng.toString(),
    "dropoff[nickname]": dropoff.name,
  });

  return `https://m.uber.com/ul/?${params.toString()}`;
}

export function buildOlaUrl(
  pickup: { lat: number; lng: number; name: string },
  dropoff: { lat: number; lng: number; name: string }
): string {
  const params = new URLSearchParams({
    pickup_lat: pickup.lat.toString(),
    pickup_lng: pickup.lng.toString(),
    drop_lat: dropoff.lat.toString(),
    drop_lng: dropoff.lng.toString(),
  });

  return `https://book.olacabs.com/?${params.toString()}`;
}