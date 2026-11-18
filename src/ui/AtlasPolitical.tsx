import type { AtlasCatalog, AtlasShape } from '../geography/atlas';
import { intersectsGeography } from '../geography/atlas';
import { COUNTRY_HIGHLIGHT, COUNTRY_HIGHLIGHT_OPACITY } from '../geography/countrySelection';
import type { GeographicBounds, GeographicCountryId } from '../geography/types';

type Fade = { previous: AtlasShape[] | null; current: AtlasShape[]; mix: number };
export function politicalLayers(overview: Fade, detail: Fade, catalog: AtlasCatalog | null, bounds: GeographicBounds[]) {
  const countries = new Map(catalog?.countries.map(c => [c.id, c]));
  return [overview, detail].flatMap((fade, level) => {
    const sources = fade.previous ? [{ shapes: fade.previous, fill: 1, border: 1 - fade.mix }, { shapes: fade.current, fill: fade.mix, border: fade.mix }] : [{ shapes: fade.current, fill: 1, border: 1 }];
    return sources.map((source, index) => ({ key: level + '-' + index, detail: level === 1, fill: source.fill, border: source.border,
      shapes: source.shapes.flatMap(shape => {
        const country = countries.get(shape.id);
        if (!country || !bounds.some(b => intersectsGeography(country.bbox, b))) return [];
        const parts = shape.parts.filter(p => bounds.some(b => intersectsGeography(p.bbox, b)));
        return parts.length ? [{ id: shape.id, color: country.color, path: parts.map(p => p.path).join(''), outline: parts.map(p => p.outline).join('') }] : [];
      }) }));
  });
}
type Props = { layers: ReturnType<typeof politicalLayers>; offsets: number[]; detail: number; width: number; opacity: number;
  phase: 'fills' | 'borders'; selectedId?: GeographicCountryId | null };
export function AtlasPolitical({ layers, offsets, detail, width, opacity, phase, selectedId }: Props) {
  const id = (key: string, country: string, outline = false) => 'atlas-' + key + '-' + country + (outline ? '-border' : '');
  const weight = (layer: Props['layers'][number]) => layer.border * (layer.detail ? detail : 1 - detail);
  if (phase === 'borders') return <g className="atlas-country-borders" fill="none" stroke="#243b42" strokeWidth={width} strokeLinejoin="round">
    {offsets.map(offset => <g key={offset} transform={`translate(${offset} 0)`} data-world-offset={offset}>
      {layers.map(layer => <g key={layer.key} opacity={opacity * weight(layer)}>
        {layer.shapes.map(shape => <use key={shape.id} href={`#${id(layer.key, shape.id, true)}`} vectorEffect="non-scaling-stroke" />)}
      </g>)}
      {selectedId && layers.map(layer => weight(layer) > 0 && layer.shapes.some(shape => shape.id === selectedId) &&
        <g key={`highlight-${layer.key}`} data-selected-country={selectedId} opacity={weight(layer)}>
          <use href={`#${id(layer.key, selectedId)}`} fill={COUNTRY_HIGHLIGHT} fillOpacity={COUNTRY_HIGHLIGHT_OPACITY} stroke="none" fillRule="evenodd" />
          <use href={`#${id(layer.key, selectedId, true)}`} stroke={COUNTRY_HIGHLIGHT} strokeWidth={Math.max(1, width)} vectorEffect="non-scaling-stroke" />
        </g>)}
    </g>)}
  </g>;
  function fill(layer: Props['layers'][number]) {
    return <g key={layer.key} opacity={layer.fill} data-political-stage={layer.key}>
      {/* Each stage is opaque: fading LOD does not darken country colors. */}
      <rect width="360" height="180" fill="#182d3d" />
      <rect width="360" height="180" fill="url(#atlas-graticule)" />
      {layer.shapes.map(shape => <use key={shape.id} href={`#${id(layer.key, shape.id)}`} data-country={shape.id} fill={shape.color} fillRule="evenodd" />)}
    </g>;
  }
  return <>
    <defs>{layers.flatMap(layer => layer.shapes.map(shape => <g key={id(layer.key, shape.id)}>
      <path id={id(layer.key, shape.id)} d={shape.path} />
      <path id={id(layer.key, shape.id, true)} d={shape.outline} vectorEffect="non-scaling-stroke" />
    </g>))}</defs>
    {offsets.map(offset => <g key={offset} transform={`translate(${offset} 0)`} className="atlas-political" data-world-offset={offset}>
      {layers.filter(l => !l.detail).map(fill)}
      {detail > 0 && <g opacity={detail} data-country-detail={detail}>{layers.filter(l => l.detail).map(fill)}</g>}
    </g>)}
  </>;
}
