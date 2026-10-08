"use client";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ICONS } from "./pins";

const FOLLOW_ZOOM = 17;
const ROUTE_AHEAD = { color: "#2f6fd6", weight: 7, opacity: 0.9, lineCap: "round", lineJoin: "round" };
const ROUTE_CASING = { color: "#ffffff", weight: 11, opacity: 0.9, lineCap: "round", lineJoin: "round" };
const ROUTE_BEHIND = { color: "#6b5a4d", weight: 6, opacity: 0.45, lineCap: "round", lineJoin: "round" };

const latLng = (p) => [p.latitude, p.longitude];

// Keeps the driver centred, until they drag the map to look around.
function Follow({ fix, route, isFollowing, onStopFollowing }) {
  const map = useMap();
  useMapEvents({ dragstart: onStopFollowing });

  useEffect(() => {
    if (!isFollowing) return;
    if (fix) map.setView(latLng(fix), Math.max(map.getZoom(), FOLLOW_ZOOM), { animate: true });
    else if (route) map.fitBounds(L.latLngBounds(route.points.map(latLng)), { padding: [40, 40] });
  }, [fix, route, isFollowing, map]);
  return null;
}

/** Full-screen driving map: the road ahead in blue, the road behind faded. */
export default function NavMap({ route, progress, fix, destination, isFollowing, onStopFollowing }) {
  const [behind, ahead] = useMemo(() => {
    if (!route) return [[], []];
    if (!progress || !fix) return [[], route.points.map(latLng)];
    const split = route.along.findIndex((d) => d > progress.along);
    const cut = split === -1 ? route.points.length : split;
    return [route.points.slice(0, cut).map(latLng), [latLng(fix), ...route.points.slice(cut).map(latLng)]];
  }, [route, progress, fix]);

  return (
    <MapContainer center={latLng(fix ?? destination)} zoom={FOLLOW_ZOOM} zoomControl={false} attributionControl className="size-full">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {behind.length > 1 && <Polyline positions={behind} pathOptions={ROUTE_BEHIND} />}
      {ahead.length > 1 && <Polyline positions={ahead} pathOptions={ROUTE_CASING} />}
      {ahead.length > 1 && <Polyline positions={ahead} pathOptions={ROUTE_AHEAD} />}
      <Marker position={latLng(destination)} icon={ICONS.home} />
      {fix && <Marker position={latLng(fix)} icon={ICONS.driver} zIndexOffset={1000} />}
      <Follow fix={fix} route={route} isFollowing={isFollowing} onStopFollowing={onStopFollowing} />
    </MapContainer>
  );
}
