"use client";

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Feature, Polygon, MultiPolygon } from "geojson";

/**
 * Leaflet, deliberately, not MapLibre.
 *
 * This view is a raster basemap with a handful of GeoJSON polygons and HTML
 * markers on top — none of MapLibre's vector-tile machinery is used. MapLibre
 * also spawns a tile-decoding web worker that Turbopack does not emit as a
 * loadable chunk: the worker request falls through to the app router, returns
 * HTML, and the map hangs before its style ever loads, with no error on the map's
 * own error channel. Leaflet has no worker and no WebGL requirement, so that whole
 * failure class disappears. For six polygons the rendering difference is nil.
 *
 * Marker icons are all divIcons, which also sidesteps Leaflet's well-known broken
 * default-icon paths under bundlers.
 */

export type MapCaller = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  state: "idle" | "playing" | "consistent" | "inconsistent" | "unusable";
};

export type MapWedge = {
  callId: string;
  polygon: Feature<Polygon | MultiPolygon>;
  status: "consistent" | "inconsistent";
};

type Props = {
  center: { lat: number; lng: number };
  zoom: number;
  callers: MapCaller[];
  wedges: MapWedge[];
  fix: Feature<Polygon | MultiPolygon> | null;
  fixCentroid: { lat: number; lng: number } | null;
  groundTruth: { lat: number; lng: number } | null;
  revealTruth: boolean;
};

// Esri's tile scheme is {z}/{y}/{x}. Swapping y and x yields a map that looks
// plausible at a glance but is scrambled.
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const WEDGE_STYLE: Record<MapWedge["status"], L.PathOptions> = {
  consistent: {
    color: "#fbbf24",
    weight: 1.4,
    opacity: 0.75,
    fillColor: "#f59e0b",
    fillOpacity: 0.11,
  },
  inconsistent: {
    color: "#ef4444",
    weight: 1.4,
    opacity: 0.8,
    dashArray: "4 3",
    fillColor: "#ef4444",
    fillOpacity: 0.07,
  },
};

const FIX_STYLE: L.PathOptions = {
  color: "#67e8f9",
  weight: 2.2,
  opacity: 1,
  fillColor: "#22d3ee",
  fillOpacity: 0.35,
};

export default function MapView({
  center,
  zoom,
  callers,
  wedges,
  fix,
  fixCentroid,
  groundTruth,
  revealTruth,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const wedgeLayerRef = useRef<L.LayerGroup | null>(null);
  const fixLayerRef = useRef<L.LayerGroup | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: false,
      attributionControl: true,
    });
    mapRef.current = map;

    // Live imagery sits underneath as the general-purpose basemap. Set
    // NEXT_PUBLIC_OFFLINE=1 to omit it entirely and rehearse the offline demo
    // without actually pulling the network down.
    if (process.env.NEXT_PUBLIC_OFFLINE !== "1") {
      L.tileLayer(ESRI_IMAGERY, {
        maxZoom: 18,
        attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
      }).addTo(map);
    }

    // Prefetched tiles for the scenario area sit on top (scripts/prefetch-tiles.mjs).
    // Offline, the layer below fails and these carry the demo; online, tiles outside
    // the prefetched box simply 404 here and the live layer shows through. No
    // branching, and the demo never depends on the venue network.
    L.tileLayer("/tiles/{z}/{x}/{y}.jpg", {
      maxZoom: 13,
      maxNativeZoom: 13,
      errorTileUrl:
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    wedgeLayerRef.current = L.layerGroup().addTo(map);
    fixLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);

    // Leaflet measures its container on creation; inside a flex layout that can
    // happen before the layout settles.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      wedgeLayerRef.current = null;
      fixLayerRef.current = null;
      markerLayerRef.current = null;
    };
    // Initial view is a mount-time concern; later prop changes must not rebuild
    // the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wedges.
  useEffect(() => {
    const layer = wedgeLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const w of wedges) {
      L.geoJSON(w.polygon, { style: WEDGE_STYLE[w.status] }).addTo(layer);
    }
  }, [wedges]);

  // Current fix.
  useEffect(() => {
    const layer = fixLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (fix) L.geoJSON(fix, { style: FIX_STYLE }).addTo(layer);
  }, [fix]);

  // Markers, rebuilt wholesale — there are at most eight.
  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const c of callers) {
      const icon = L.divIcon({
        className: "sf-icon",
        html: `<div class="sf-marker" data-state="${c.state}"><span class="sf-dot"></span><span class="sf-label">${c.label}</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker([c.lat, c.lng], { icon, interactive: false }).addTo(layer);
    }

    if (fixCentroid) {
      const icon = L.divIcon({
        className: "sf-icon",
        html: `<div class="sf-fix"><span class="sf-cross">✛</span><span class="sf-fix-label">fix</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker([fixCentroid.lat, fixCentroid.lng], { icon, interactive: false }).addTo(layer);
    }

    if (revealTruth && groundTruth) {
      const icon = L.divIcon({
        className: "sf-icon",
        html: `<div class="sf-truth"><span class="sf-cross">✕</span><span class="sf-truth-label">ignition</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker([groundTruth.lat, groundTruth.lng], { icon, interactive: false }).addTo(layer);
    }
  }, [callers, fixCentroid, groundTruth, revealTruth]);

  // Keep everything relevant in frame as the picture develops — but only refit when
  // the set of plotted positions actually changes. Refitting on every caller status
  // change would yank the view around while the operator is talking.
  const fittedKeyRef = useRef("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || callers.length === 0) return;

    const key =
      callers.map((c) => c.id).sort().join(",") +
      (fixCentroid ? `|${fixCentroid.lat.toFixed(4)},${fixCentroid.lng.toFixed(4)}` : "");
    if (key === fittedKeyRef.current) return;
    fittedKeyRef.current = key;

    const points: L.LatLngExpression[] = callers.map((c) => [c.lat, c.lng]);
    if (fixCentroid) points.push([fixCentroid.lat, fixCentroid.lng]);

    map.fitBounds(L.latLngBounds(points), { padding: [80, 80], maxZoom: 12, animate: true });
  }, [callers, fixCentroid]);

  return <div ref={containerRef} className="h-full w-full bg-[#0a0e13]" />;
}
