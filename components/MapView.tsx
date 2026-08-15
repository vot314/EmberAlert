"use client";

import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Incident, IncidentSeverity } from "./IncidentList";
import { type WindData } from "@/lib/wind";

type Props = {
  center: { lat: number; lng: number };
  zoom: number;
  incidents: Incident[];
  selectedId: string | null;
  showWind?: boolean;
  windData?: WindData | null;
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
  onSelectIncident,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const radiusLayerRef = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelectIncident);
  useEffect(() => {
    onSelectRef.current = onSelectIncident;
  }, [onSelectIncident]);
  const windLayerRef = useRef<L.LayerGroup | null>(null);
  const [zoomLevel, setZoomLevel] = useState(zoom);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: false,
      attributionControl: true,
      // Leaflet fades each tile in by animating its inline opacity from a
      // requestAnimationFrame loop. If that loop is throttled — a background tab, a
      // hidden pane, a slow first paint — tiles can be left stranded part-way and the
      // basemap renders permanently washed out or near-black. Nothing about this view
      // needs the fade, so turn it off and have tiles paint at full opacity.
      fadeAnimation: false,
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

    radiusLayerRef.current = L.layerGroup().addTo(map);
    windLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);

    map.on("zoomend", () => setZoomLevel(map.getZoom()));

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      radiusLayerRef.current = null;
      windLayerRef.current = null;
      markerLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const step = 5;
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

  // Severity radius: a ring around each incident whose size scales with severity, in
  // the same hue as its marker. Radius is in metres and proportional to the score, so a
  // score of 20 covers ~12km and a score of 100 covers ~60km. Non-interactive so it
  // never intercepts a click meant for the marker underneath.
  useEffect(() => {
    const layer = radiusLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const inc of incidents) {
      const colors = SEVERITY_COLORS[inc.severity] || SEVERITY_COLORS.Moderate;
      const isSelected = inc.id === selectedId;
      // Floor plus linear term: the floor keeps a low-severity fire legible at
      // province scale, the linear term makes the difference between a 20 and a 100
      // obvious at a glance.
      const radiusMeters = 10_000 + inc.score * 700;

      L.circle([inc.location.lat, inc.location.lng], {
        radius: radiusMeters,
        color: colors.bg,
        weight: isSelected ? 1.8 : 1.2,
        opacity: isSelected ? 0.85 : 0.6,
        fillColor: colors.bg,
        fillOpacity: isSelected ? 0.22 : 0.15,
        interactive: false,
      }).addTo(layer);
    }
  }, [incidents, selectedId]);

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
            <span style="
              font: 700 ${isSelected ? "13px" : "11px"}/1 ui-sans-serif, system-ui, sans-serif;
              color: #0f172a;
            ">${inc.rank}</span>
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
            #${inc.rank} ${inc.name} · ${inc.score}${inc.callCount > 1 ? ` · ${inc.callCount} calls` : ""}
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

      marker.on("click", () => onSelectRef.current?.(inc.id));

      marker.addTo(layer);
    }
  }, [incidents, selectedId, zoomLevel]);

  /**
   * Frame the map: fly to a selected incident, otherwise fit every incident.
   *
   * The fit is debounced. Incidents arrive one at a time as each call is analysed, and
   * Leaflet silently DROPS a fitBounds issued while a previous zoom animation is still
   * running — so the first call (a single incident, pinned to maxZoom) used to win and
   * every later one was discarded, leaving the map zoomed into whichever fire happened
   * to resolve first while the rest sat off-screen. Cancelling the pending fit on each
   * change means only the final, complete set is ever framed.
   *
   * maxZoom is 9 rather than 12 so a lone incident still shows its surroundings instead
   * of filling the view with one hillside.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedId) {
      const inc = incidents.find((i) => i.id === selectedId);
      if (inc) {
        map.flyTo([inc.location.lat, inc.location.lng], 10, { animate: true, duration: 0.8 });
      }
      return;
    }

    if (incidents.length === 0) return;

    const timer = setTimeout(() => {
      const points: L.LatLngExpression[] = incidents.map((i) => [i.location.lat, i.location.lng]);
      map.fitBounds(L.latLngBounds(points), { padding: [90, 90], maxZoom: 9, animate: true });
    }, 350);

    return () => clearTimeout(timer);
  }, [selectedId, incidents]);

  return (
    <div className="relative h-full w-full bg-[#0a0e13]">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
