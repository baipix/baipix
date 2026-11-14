import { EFFECT_TYPES, MAX_EFFECT_SIZE, MAX_SHADOW_OFFSET, type LayerEffect } from '../../engine/effects';
import { useT } from '../../i18n';
import { useEditor, useEditorState } from '../EditorContext';
import { Checkbox } from '../components/Checkbox';
import { IconButton } from '../components/IconButton';
import { SelectField } from '../components/SelectField';
import { openMenu } from '../components/Menu';
import { NumberField } from '../components/NumberField';
import { PaletteColorButton } from '../components/PaletteColorButton';
import { openSection, Section } from '../components/Section';

/**
 * The active layer's effects, like in Figma: "+" adds one, each can be tuned, hidden or removed
 * at any time without touching the pixels. They show on the canvas and in exports.
 */
export function EffectsSection() {
  const t = useT();
  const editor = useEditor();
  const layer = useEditorState((s) => s.doc.layers[s.doc.activeLayer]);
  const onLayer = useEditorState((s) => !s.referenceSelected && !s.selectedGroup);
  useEditorState((s) => s.revision);
  const hasLight = useEditorState((s) => !!s.doc.light);
  const effects = layer.effects ?? [];
  const set = (k: number, patch: Partial<LayerEffect>, done = true) => editor.setEffect(k, patch, done);
  const number = (
    k: number,
    key: 'size' | 'x' | 'y',
    value: number,
    min: number,
    max: number,
    glyph: string,
    label: string,
  ) => (
    <NumberField
      value={value}
      min={min}
      max={max}
      label={glyph}
      suffix="px"
      ariaLabel={label}
      scrubHint={t('common.dragToAdjust')}
      sensitivity={10}
      // A shadow moved by hand stops following the light.
      onChange={(v, final) =>
        set(k, { [key]: v, ...(key !== 'size' && { followLight: false }) } as Partial<LayerEffect>, final)
      }
    />
  );

  // A group or the reference image is selected: effects belong to layers.
  if (!onLayer) return null;
  return (
    <Section
      id="effects"
      empty={effects.length === 0}
      title={t('section.effects')}
      info={t('effects.hint')}
      aside={
        <>
          {effects.length > 0 && (
            <IconButton
              icon="more"
              label={t('options.more')}
              aria-haspopup="menu"
              onClick={(e) =>
                openMenu(e.currentTarget, [
                  {
                    label: t('effects.apply'),
                    disabled: layer.locked,
                    onSelect: () => editor.applyEffects(),
                  },
                ])
              }
            />
          )}
          <IconButton
            icon="plus"
            label={t('effects.add')}
            aria-haspopup="menu"
            onClick={(e) =>
              openMenu(
                e.currentTarget,
                EFFECT_TYPES.map((type) => ({
                  label: t(`effects.${type}`),
                  onSelect: () => {
                    editor.addEffect(type);
                    openSection('effects');
                  },
                })),
              )
            }
          />
        </>
      }
    >
      {effects.map((effect, k) => (
        <div key={k} className={`effect-row${effect.visible ? '' : ' is-hidden'}`}>
          <div className="effect-head">
            <IconButton
              icon={effect.visible ? 'eye' : 'eyeOff'}
              label={effect.visible ? t('effects.hide') : t('effects.show')}
              onClick={() => set(k, { visible: !effect.visible })}
            />
            <span className="effect-name truncate">{t(`effects.${effect.type}`)}</span>
            <PaletteColorButton
              color={effect.color}
              label={t('effects.color')}
              onChange={(color, final) => set(k, { color }, final)}
            />
            <IconButton icon="minus" label={t('effects.remove')} onClick={() => editor.removeEffect(k)} />
          </div>
          <div className="two-columns">
            {effect.type === 'shadow' ? (
              <>
                {number(k, 'x', effect.x, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET, 'X', t('effects.x'))}
                {number(k, 'y', effect.y, -MAX_SHADOW_OFFSET, MAX_SHADOW_OFFSET, 'Y', t('effects.y'))}
              </>
            ) : (
              number(k, 'size', effect.size, 1, MAX_EFFECT_SIZE, '⇔', t('effects.size'))
            )}
            {effect.type === 'outline' && (
              <SelectField
                label={t('effects.place')}
                value={`${effect.place}${effect.corners ? '-corners' : ''}`}
                options={[
                  { value: 'outside', label: t('effects.outside') },
                  { value: 'outside-corners', label: t('effects.outsideCorners') },
                  { value: 'inside', label: t('effects.inside') },
                  { value: 'inside-corners', label: t('effects.insideCorners') },
                ]}
                onChange={(v) => {
                  const [place, corners] = v.split('-');
                  set(k, {
                    place: place as 'outside' | 'inside',
                    corners: !!corners,
                  } as Partial<LayerEffect>);
                }}
              />
            )}
          </div>
          {effect.type === 'shadow' && hasLight && (
            <Checkbox
              checked={!!effect.followLight}
              onChange={(v) => set(k, { followLight: v } as Partial<LayerEffect>)}
              label={t('effects.followLight')}
            />
          )}
        </div>
      ))}
    </Section>
  );
}
