"use client";

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { severityColor } from "@/lib/fires";

/**
 * Leaflet rather than MapLibre: this is a raster basemap with a handful of markers,
 * and MapLibre's tile-decoding web worker is not emitted as a loadable chunk under
 * Turbopack — the map hangs before its style loads, with nothing on its error channel.
 * Marker icons are divIcons, which also avoids Leaflet's broken default icon paths.
 */

export type MapFire = {
  id: string;
  rank: number;
  place: string;
  lat: number;
  lng: number;
  severity: number;
  callCount: number;
};

type Props = {
  center: { lat: number; lng: number };
  zoom: number;
  fires: MapFire[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

// Esri's tile scheme is {z}/{y}/{x} — y before x. Carto below uses standard {z}/{x}/{y}.
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
// Labels-only overlay: place names with no filled polygons, so the imagery stays clean.
const CARTO_LABELS =
  "https://basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}.png";

export default function MapView({ center, zoom, fires, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // Marker click handlers are bound once when a marker is created, so they must read
  // the latest callback through a ref. Assigning during render is a React violation;
  // an effect keeps it correct without re-binding every marker.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: false,
    });
    mapRef.current = map;

    L.tileLayer(ESRI_IMAGERY, {
      maxZoom: 18,
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    }).addTo(map);
    L.tileLayer(CARTO_LABELS, {
      maxZoom: 18,
      className: "sf-labels",
      attribution: "Labels &copy; OpenStreetMap contributors, &copy; CARTO",
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);

    // Leaflet measures its container on creation, which inside a flex layout can
    // happen before the layout settles.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Initial view is a mount-time concern; later prop changes must not rebuild the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Markers, rebuilt wholesale — there are only a handful of fires.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const f of fires) {
      const color = severityColor(f.severity);
      const selected = f.id === selectedId;
      const icon = L.divIcon({
        className: "sf-icon",
        html: `
          <div class="sf-fire${selected ? " sf-fire-selected" : ""}" style="--fire:${color}">
            <span class="sf-fire-pin"><span class="sf-fire-rank">${f.rank}</span></span>
            <span class="sf-fire-label">
              <b>${f.place}</b>
              <i>severity ${f.severity}${f.callCount > 1 ? ` &middot; ${f.callCount} calls` : ""}</i>
            </span>
          </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      L.marker([f.lat, f.lng], { icon, riseOnHover: true })
        .addTo(layer)
        .on("click", () => onSelectRef.current(f.id));
    }
  }, [fires, selectedId]);

  // Keep every located fire in frame as reports arrive.
  const fittedRef = useRef("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fires.length === 0) return;
    const key = fires.map((f) => f.id).sort().join(",");
    if (key === fittedRef.current) return;
    fittedRef.current = key;

    map.fitBounds(L.latLngBounds(fires.map((f) => [f.lat, f.lng] as L.LatLngExpression)), {
      padding: [90, 90],
      maxZoom: 9,
      animate: true,
    });
  }, [fires]);

  return <div ref={containerRef} className="h-full w-full bg-[#0a0e13]" />;
}
