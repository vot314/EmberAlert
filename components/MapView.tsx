"use client";

import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Incident, IncidentSeverity } from "./IncidentList";
import { type WindData } from "@/lib/wind";

export type MapLandmark = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  referenced: boolean;
};

type Props = {
  center: { lat: number; lng: number };
  zoom: number;
  incidents: Incident[];
  selectedId: string | null;
  showWind?: boolean;
  windData?: WindData | null;
  landmarks?: MapLandmark[];
  onSelectIncident?: (id: string) => void;
};

const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const CARTO_LABELS =
  "https://basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}.png";

const SEVERITY_COLORS: Record<IncidentSeverity, { bg: string; border: string; glow: string }> = {
  Critical: { bg: "#ef4444", border: "#7f1d1d", glow: "rgba(239, 68, 68, 0.6)" },
  High: { bg: "#f97316", border: "#7c2d12", glow: "rgba(249, 115, 22, 0.5)" },
  Moderate: { bg: "#f59e0b", border: "#78350f", glow: "rgba(245, 158, 11, 0.4)" },
  Low: { bg: "#10b981", border: "#064e3b", glow: "rgba(16, 185, 129, 0.3)" },
};

export default function MapView({
  center,
  zoom,
  incidents,
  selectedId,
  showWind = true,
  windData = null,
  landmarks = [],
  onSelectIncident,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const windLayerRef = useRef<L.LayerGroup | null>(null);
  const landmarkLayerRef = useRef<L.LayerGroup | null>(null);
  const [zoomLevel, setZoomLevel] = useState(zoom);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: false,
      attributionControl: true,
    });
    mapRef.current = map;

    // Create custom Leaflet pane for dark overlay at zIndex 250 (behind vectors & markers)
    const darkPane = map.createPane("darkOverlayPane");
    darkPane.style.zIndex = "250";
    darkPane.style.pointerEvents = "none";

    const BLANK_TILE =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    if (process.env.NEXT_PUBLIC_OFFLINE !== "1") {
      L.tileLayer(ESRI_IMAGERY, {
        maxZoom: 18,
        attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
      }).addTo(map);
      L.tileLayer(CARTO_LABELS, {
        maxZoom: 18,
        className: "sf-labels",
        attribution: "Labels &copy; OpenStreetMap contributors, &copy; CARTO",
      }).addTo(map);
    }

    L.tileLayer("/tiles/{z}/{x}/{y}.jpg", {
      maxZoom: 13,
      maxNativeZoom: 13,
      errorTileUrl: BLANK_TILE,
    }).addTo(map);

    L.tileLayer("/tiles-labels/{z}/{x}/{y}.png", {
      maxZoom: 13,
      maxNativeZoom: 13,
      className: "sf-labels",
      errorTileUrl: BLANK_TILE,
    }).addTo(map);

    // Render dark background overlay on darkOverlayPane (zIndex 250)
    L.rectangle(
      [
        [-90, -180],
        [90, 180],
      ],
      {
        color: "none",
        fillColor: "#020617",
        fillOpacity: 0.55,
        pane: "darkOverlayPane",
      }
    ).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    landmarkLayerRef.current = L.layerGroup().addTo(map);
    windLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);

    map.on("zoomend", () => setZoomLevel(map.getZoom()));

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      landmarkLayerRef.current = null;
      windLayerRef.current = null;
      markerLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render landmarks if available
  useEffect(() => {
    const layer = landmarkLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const lm of landmarks) {
      if (!lm.referenced && zoomLevel < 10) continue;
      const state = lm.referenced ? "referenced" : "minor";
      const icon = L.divIcon({
        className: "sf-icon",
        html: `<div class="sf-landmark" data-state="${state}"><span class="sf-lm-dot"></span><span class="sf-lm-label">${lm.label}</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker([lm.lat, lm.lng], { icon, interactive: false, zIndexOffset: -1000 }).addTo(layer);
    }
  }, [landmarks, zoomLevel]);

  // Render Continuous Wave Wind Fronts + Dynamically Scaled & Perfectly Aligned Directional Triangles
  useEffect(() => {
    const layer = windLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    if (!showWind || !windData) return;

    // Calculate dynamic line weight and triangle size based on zoom level
    const lineWeight = Math.max(1.4, Math.min(2.4, (zoomLevel - 6) * 0.35));
    const triangleSize = Math.round(Math.max(7, Math.min(14, (zoomLevel - 6) * 1.5)));
    const iconAnchor = Math.round(triangleSize / 2);

    for (const front of windData.waveFronts || []) {
      if (!front.latLngs || front.latLngs.length < 2) continue;

      // 1. Render smooth curved front line
      const polyline = L.polyline(front.latLngs, {
        color: front.color,
        weight: lineWeight,
        opacity: 0.9,
        smoothFactor: 1.5,
        dashArray: "12, 6",
      });
      polyline.addTo(layer);

      // 2. Place high-visibility directional triangles aligned perfectly along the front curve
      const step = 3;
      for (let i = 2; i < front.latLngs.length - 1; i += step) {
        const p1 = front.latLngs[i - 1]!;
        const p2 = front.latLngs[i]!;

        // Calculate exact screen segment tangent angle so triangle aligns 100% along the front line
        const pt1 = map.latLngToContainerPoint(p1);
        const pt2 = map.latLngToContainerPoint(p2);
        const angleDeg = Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x) * (180 / Math.PI) + 90;

        const triangleIcon = L.divIcon({
          className: "wind-triangle-marker",
          html: `
            <div style="
              width: ${triangleSize}px;
              height: ${triangleSize}px;
              display: flex;
              align-items: center;
              justify-content: center;
              transform: rotate(${angleDeg.toFixed(1)}deg);
              pointer-events: none;
            ">
              <svg width="${triangleSize}" height="${triangleSize}" viewBox="0 0 12 12" fill="none" style="filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.9));">
                <polygon points="6,1 11,11 1,11" fill="${front.color}" stroke="#ffffff" stroke-width="1.2" />
              </svg>
            </div>
          `,
          iconSize: [triangleSize, triangleSize],
          iconAnchor: [iconAnchor, iconAnchor],
        });

        L.marker(p2, { icon: triangleIcon, interactive: false, zIndexOffset: 480 }).addTo(layer);
      }

      // 3. Line up inline speed text along the front line (speed only, no background box)
      const midIdx = Math.floor(front.latLngs.length / 2);
      const p1 = front.latLngs[midIdx - 1] || front.latLngs[0];
      const p2 = front.latLngs[midIdx] || front.latLngs[1];

      const pt1 = map.latLngToContainerPoint(p1);
      const pt2 = map.latLngToContainerPoint(p2);
      let textAngle = Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x) * (180 / Math.PI);
      if (textAngle > 90 || textAngle < -90) {
        textAngle += 180;
      }

      const badgeIcon = L.divIcon({
        className: "wave-front-inline-label",
        html: `
          <div style="
            transform: translate(-50%, -50%) rotate(${textAngle.toFixed(1)}deg);
            color: ${front.color};
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: ${Math.max(9, Math.min(11, zoomLevel))}px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-shadow: 0 1px 3px #000000, 0 0 6px #000000, 0 0 10px #000000;
            white-space: nowrap;
            pointer-events: none;
            user-select: none;
          ">
            ${front.speedKmH} km/h
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      L.marker(p2, { icon: badgeIcon, interactive: false, zIndexOffset: 500 }).addTo(layer);
    }
  }, [showWind, windData, zoomLevel]);

  // Render incident markers directly as dots on the map (Nametags fade out when zoomed out < 10.5)
  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const showNametag = zoomLevel >= 10.5;

    for (const inc of incidents) {
      const isSelected = inc.id === selectedId;
      const colors = SEVERITY_COLORS[inc.severity] || SEVERITY_COLORS.Moderate;
      const pulseClass = inc.severity === "Critical" ? "animate-pulse" : "";
      const nametagOpacity = isSelected || showNametag ? 1 : 0;

      const html = `
        <div class="ember-marker ${isSelected ? "selected" : ""}" style="cursor: pointer;">
          <div class="ember-dot-ring ${pulseClass}" style="
            width: ${isSelected ? "28px" : "20px"};
            height: ${isSelected ? "28px" : "20px"};
            border-radius: 50%;
            background-color: ${colors.bg};
            border: 2px solid ${isSelected ? "#ffffff" : colors.border};
            box-shadow: 0 0 14px ${colors.glow};
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
          ">
            <div style="
              width: ${isSelected ? "10px" : "6px"};
              height: ${isSelected ? "10px" : "6px"};
              border-radius: 50%;
              background-color: #ffffff;
            "></div>
          </div>
          <div class="ember-label" style="
            position: absolute;
            top: ${isSelected ? "32px" : "24px"};
            left: 50%;
            transform: translateX(-50%);
            white-space: nowrap;
            background: rgba(15, 23, 42, 0.95);
            color: #f8fafc;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 7px;
            border-radius: 4px;
            border: 1px solid ${isSelected ? "#38bdf8" : "#334155"};
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.6);
            pointer-events: none;
            opacity: ${nametagOpacity};
            transition: opacity 0.25s ease-in-out;
            z-index: 10;
          ">
            ${inc.name} (${inc.severity})
          </div>
        </div>
      `;

      const icon = L.divIcon({
        className: "ember-icon",
        html,
        iconSize: [0, 0],
        iconAnchor: [isSelected ? 14 : 10, isSelected ? 14 : 10],
      });

      const marker = L.marker([inc.location.lat, inc.location.lng], {
        icon,
        interactive: true,
        zIndexOffset: isSelected ? 1000 : 100,
      });

      if (onSelectIncident) {
        marker.on("click", () => onSelectIncident(inc.id));
      }

      marker.addTo(layer);
    }
  }, [incidents, selectedId, zoomLevel]);

  // Center map on selected incident if clicked
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedId) {
      const inc = incidents.find((i) => i.id === selectedId);
      if (inc) {
        map.flyTo([inc.location.lat, inc.location.lng], 12, { animate: true, duration: 0.8 });
      }
    } else if (incidents.length > 0) {
      const points: L.LatLngExpression[] = incidents.map((i) => [i.location.lat, i.location.lng]);
      map.fitBounds(L.latLngBounds(points), { padding: [80, 80], maxZoom: 12, animate: true });
    }
  }, [selectedId, incidents]);

  return (
    <div className="relative h-full w-full bg-[#0a0e13]">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
