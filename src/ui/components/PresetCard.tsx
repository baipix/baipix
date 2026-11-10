import type { CSSProperties } from 'react';
import { PALETTE_PRESETS } from '../../engine/palette';
import { useT } from '../../i18n';
import { TEMPLATE_ART } from '../templateArt';
import type { Template } from '../templates';

/** A preset as a small picture of what it's for: grey, in its palette's colors on hover. */
function TemplatePreview({ template }: { template: Template }) {
  const art = TEMPLATE_ART[template.id];
  return (
    <span className="home-thumb home-template-preview" aria-hidden="true">
      {art && (
        <span className="home-template-board">
          <svg
            className="home-template-art"
            width={art.rows[0].length * art.scale}
            height={art.rows.length * art.scale}
            viewBox={`0 0 ${art.rows[0].length} ${art.rows.length}`}
            shapeRendering="crispEdges"
          >
            {art.rows.flatMap((row, y) =>
              [...row.matchAll(/([^.])\1*/g)].map((run) => {
                const ink = art.ink[run[1]];
                const color = art.colors[run[1]];
                return (
                  <rect
                    key={`${y}-${run.index}`}
                    x={run.index}
                    y={y}
                    width={run[0].length}
                    height={1}
                    className={ink === '#' ? undefined : ink === '+' ? 'is-faint' : 'is-color-only'}
                    style={color ? ({ '--color': color } as CSSProperties) : undefined}
                  />
                );
              }),
            )}
          </svg>
        </span>
      )}
    </span>
  );
}

/** A preset on the files screen: its picture, its name, its size and palette. */
export function PresetCard({ template, onClick }: { template: Template; onClick?: () => void }) {
  const t = useT();
  return (
    <button type="button" className="home-card home-template" onClick={onClick}>
      <TemplatePreview template={template} />
      <span className="home-card-info">
        <span className="home-card-name truncate">{t(template.label)}</span>
        <span className="home-card-meta muted truncate">
          {template.width} × {template.height} · {PALETTE_PRESETS[template.palette]?.name}
        </span>
      </span>
    </button>
  );
}
