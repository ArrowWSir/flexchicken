import L from "leaflet";

// Pins drawn in HTML, so Leaflet never looks for its default PNG icons.
const pin = (kind, label) =>
  L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<span class="map-pin map-pin--${kind}" aria-label="${label}"><span></span></span>`,
  });

export const ICONS = {
  shop: pin("shop", "Flex Chicken"),
  home: pin("home", "Delivery address"),
  driver: pin("driver", "Driver"),
};
