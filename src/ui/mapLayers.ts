export const mapLayers = [
  { id: 'divisions', label: 'Divisions', icon: 'M3 6h18v12H3z M3 6l18 12M21 6L3 18' },
  { id: 'cities', label: 'Cities', icon: 'M3 21V9h7v12M10 21V3h11v18M6 12h1M6 16h1M14 7h3M14 11h3M14 15h3M1 21h22' },
  { id: 'bunkers', label: 'Bunkers', icon: 'M3 20V11l4-6h10l4 6v9H3z M3 11h18M9 20v-6h6v6' },
  { id: 'roads', label: 'Roads', icon: 'M6 2L3 22M18 2l3 20M12 3v4M12 10v4M12 17v4' },
  { id: 'railways', label: 'Railways', icon: 'M7 2L5 22M17 2l2 20M7 5h10M6 10h12M6 15h12M5 20h14' },
  { id: 'ports', label: 'Ports', icon: 'M12 7v14M5 12H2c0 5 4 9 10 9s10-4 10-9h-3M8 11h8 M14 5a2 2 0 1 1-4 0a2 2 0 0 1 4 0z' },
  { id: 'airports', label: 'Airports', icon: 'M12 2l2 8 8 5v2l-8-2v5l3 2H7l3-2v-5l-8 2v-2l8-5 2-8z' },
] as const;

export type MapLayerId = typeof mapLayers[number]['id'];
export type MapLayerState = Record<MapLayerId, boolean>;

export function initialMapLayers(): MapLayerState {
  return { divisions: false, cities: false, bunkers: false, roads: false, railways: false, ports: false, airports: false };
}

// Independent flags, not a mutually exclusive layer selection.
export function toggleMapLayer(layers: MapLayerState, id: MapLayerId): MapLayerState {
  return { ...layers, [id]: !layers[id] };
}
