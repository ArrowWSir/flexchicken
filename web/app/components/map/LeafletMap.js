"use client";
import { useEffect } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { ICONS } from "./pins";

const MILE_IN_METRES = 1609.344;

// Keeps every marker in view as they move.
function FitTo({ points, padding }) {
  const map = useMap();
  const key = points.map((p) => `${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`).join("|");
  useEffect(() => {
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 15);
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude])), { padding: [padding, padding] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/**
 * `rings` are guide circles in miles (the delivery zones are by postcode;
 * the owner describes them as about 1 and 2 miles).
 * @param {{ center, markers: { kind: "shop" | "home" | "driver", latitude, longitude }[], rings?: number[], isInside?, fit?: object[] }} props
 */
export default function LeafletMap({ center, markers, rings = [], isInside = true, fit, className = "" }) {
  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={13}
      scrollWheelZoom={false}
      attributionControl
      className={`size-full ${className}`}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {rings.map((miles) => (
        <Circle
          key={miles}
          center={[center.latitude, center.longitude]}
          radius={miles * MILE_IN_METRES}
          pathOptions={{
            color: isInside ? "#287a1c" : "#d92b2d",
            weight: 2,
            fillColor: isInside ? "#287a1c" : "#d92b2d",
            fillOpacity: 0.06,
            dashArray: "6 6",
          }}
        />
      ))}
      {markers.map((m) => (
        <Marker key={m.kind} position={[m.latitude, m.longitude]} icon={ICONS[m.kind]} />
      ))}
      <FitTo points={fit ?? markers} padding={36} />
    </MapContainer>
  );
}
