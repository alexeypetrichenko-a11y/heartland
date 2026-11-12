import { mapLayers, type MapLayerId, type MapLayerState } from './mapLayers';

type Props = { layers: MapLayerState; divisionsAvailable: boolean; onToggle: (id: MapLayerId) => void };

export function MapLayerToolbar({ layers, divisionsAvailable, onToggle }: Props) {
  return <div className="map-layer-toolbar">
    <p id="map-layers-help" className="sr-only">Independent map layers. Swipe horizontally for more. Keyboard: focus this row and use Left, Right, Home or End to scroll. Unavailable categories cannot be turned on.</p>
    <div className="map-layer-scroll" role="region" aria-label="Map layers" aria-describedby="map-layers-help" tabIndex={0}
      onKeyDown={event => {
        if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.currentTarget.scrollBy({ left: event.key === 'ArrowLeft' ? -160 : 160 });
        else if (event.key === 'Home') event.currentTarget.scrollLeft = 0;
        else if (event.key === 'End') event.currentTarget.scrollLeft = event.currentTarget.scrollWidth;
        else return;
        event.preventDefault();
      }}>
      {mapLayers.map(layer => {
        const available = layer.id === 'divisions' && divisionsAvailable;
        const reason = layer.id === 'divisions' ? 'Choose a country first' : 'Not available yet';
        return <button key={layer.id} type="button" className="map-layer-button" disabled={!available}
          aria-label={`${layer.label === 'Bunkers' ? 'Bunkers / fortifications' : layer.label} layer${available ? '' : ` — ${reason.toLowerCase()}`}`}
          aria-pressed={layers[layer.id]} aria-controls={layer.id === 'divisions' ? 'map-divisions-overlay' : undefined}
          title={available ? `${layer.label} layer` : `${layer.label}: ${reason}`} onClick={() => onToggle(layer.id)}>
          <span className="map-layer-label"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={layer.icon} /></svg>{layer.label}</span>
          {!available && <span className="map-layer-unavailable">{layer.id === 'divisions' ? 'Choose country' : 'Unavailable'}</span>}
        </button>;
      })}
    </div>
    {layers.divisions && <p className="map-layer-note">Illustrative markers · <span className="own-unit-key">■ You</span> · □ Combat report</p>}
  </div>;
}
