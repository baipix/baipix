import { useEffect, useRef } from 'react';
import { LIGHT_HEIGHT, normalizeAngle, towardLight, type BoardLight } from '../../engine/light';
import { useT } from '../../i18n';
import { readTheme } from '../render/theme';

/** The stage's height, in CSS pixels (its width is the panel's). */
const STAGE_HEIGHT = 156;
/** The sphere: its radius in its own pixels, and how big they are. */
const SPHERE_RADIUS = 7;
const SPHERE_PIXEL = 5;
/** How far the lamp goes from the sphere: near is a high light, far a low one. */
const LAMP_NEAR = 44;
const LAMP_FAR = 72;
/** Shades of the sphere, dark to light. */
const SPHERE_STEPS = 6;
/** Arrow keys turn the light by a degree, by 15 with Shift; up and down raise and lower it. */
const KEY_STEP = 1;
const KEY_STEP_SHIFT = 15;

const lampDistance = (height: number) =>
  LAMP_NEAR + ((LIGHT_HEIGHT.max - height) / (LIGHT_HEIGHT.max - LIGHT_HEIGHT.min)) * (LAMP_FAR - LAMP_NEAR);
const heightAt = (distance: number) => {
  const k = Math.min(1, Math.max(0, (distance - LAMP_NEAR) / (LAMP_FAR - LAMP_NEAR)));
  return Math.round(LIGHT_HEIGHT.max - k * (LIGHT_HEIGHT.max - LIGHT_HEIGHT.min));
};

/**
 * A small stage to set a light by hand, like moving a lamp around an object: a pixel sphere in the
 * middle, shaded as the light falls on it, with its shadow on the ground. Dragging the lamp around
 * sets the angle; nearer the sphere is a higher light, farther a lower one. `final` is false
 * while dragging.
 */
export function LightStage({
  light,
  onChange,
}: {
  light: BoardLight;
  onChange: (light: BoardLight, final: boolean) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(STAGE_HEIGHT * dpr);
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      const theme = readTheme();
      const w = r.width;
      const cx = w / 2;
      const cy = STAGE_HEIGHT / 2;
      const { x: ux, y: uy } = towardLight(light.angle);
      const size = SPHERE_RADIUS * SPHERE_PIXEL;

      // The shadow on the ground, away from the light: the lower the light, the longer it is.
      const length = size * Math.min(3, 1 / Math.tan((light.height * Math.PI) / 180));
      ctx.fillStyle = theme.lightShadow;
      ctx.beginPath();
      ctx.ellipse(
        cx - (ux * length) / 2,
        cy + size * 0.8 - (uy * length) / 4,
        size * 0.7 + length / 2,
        size * 0.35,
        Math.atan2(uy / 2, ux),
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // The beam, from the lamp onto the sphere.
      const d = lampDistance(light.height);
      const lx = cx + ux * d;
      const ly = cy + uy * d;
      const toward = Math.atan2(cy - ly, cx - lx);
      ctx.fillStyle = theme.lightBeam;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.arc(lx, ly, d + size * 1.6, toward - 0.42, toward + 0.42);
      ctx.closePath();
      ctx.fill();

      // The sphere, in a few flat shades, the way a pixel artist would shade it.
      const dark = theme.sphereDark;
      const bright = theme.sphereLit;
      const up = Math.sin((light.height * Math.PI) / 180);
      const flat = Math.cos((light.height * Math.PI) / 180);
      ctx.save();
      for (let y = 0; y < SPHERE_RADIUS * 2; y++)
        for (let x = 0; x < SPHERE_RADIUS * 2; x++) {
          const u = (x + 0.5 - SPHERE_RADIUS) / SPHERE_RADIUS;
          const v = (y + 0.5 - SPHERE_RADIUS) / SPHERE_RADIUS;
          if (u * u + v * v > 1) continue;
          const z = Math.sqrt(1 - u * u - v * v);
          const lit = Math.max(0, u * ux * flat + v * uy * flat + z * up);
          const step = Math.min(SPHERE_STEPS - 1, Math.floor(lit * SPHERE_STEPS));
          ctx.globalAlpha = 1;
          ctx.fillStyle = dark;
          ctx.fillRect(
            cx - size + x * SPHERE_PIXEL,
            cy - size + y * SPHERE_PIXEL,
            SPHERE_PIXEL,
            SPHERE_PIXEL,
          );
          ctx.globalAlpha = step / (SPHERE_STEPS - 1);
          ctx.fillStyle = bright;
          ctx.fillRect(
            cx - size + x * SPHERE_PIXEL,
            cy - size + y * SPHERE_PIXEL,
            SPHERE_PIXEL,
            SPHERE_PIXEL,
          );
        }
      ctx.restore();

      // The lamp, with a halo.
      ctx.fillStyle = theme.lightBeam;
      ctx.beginPath();
      ctx.arc(lx, ly, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.lightLamp;
      ctx.beginPath();
      ctx.arc(lx, ly, 7, 0, Math.PI * 2);
      ctx.fill();
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', draw);
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      media.removeEventListener('change', draw);
      mo.disconnect();
    };
  }, [light]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>): BoardLight => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - STAGE_HEIGHT / 2;
    const angle = normalizeAngle((Math.atan2(-y, x) * 180) / Math.PI);
    return { ...light, angle, height: heightAt(Math.hypot(x, y)) };
  };

  return (
    <canvas
      ref={ref}
      className="light-stage"
      style={{ height: STAGE_HEIGHT }}
      tabIndex={0}
      role="slider"
      aria-label={t('light.stage')}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={light.angle}
      aria-valuetext={t('light.readout', { angle: light.angle, height: light.height })}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(at(e), false);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onChange(at(e), false);
      }}
      onPointerUp={(e) => onChange(at(e), true)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? KEY_STEP_SHIFT : KEY_STEP;
        const turn = { ArrowLeft: step, ArrowRight: -step }[e.key];
        const raise = { ArrowUp: step, ArrowDown: -step }[e.key];
        if (turn === undefined && raise === undefined) return;
        // The arrows are the light's here, not the selection's.
        e.preventDefault();
        e.stopPropagation();
        const height = Math.min(LIGHT_HEIGHT.max, Math.max(LIGHT_HEIGHT.min, light.height + (raise ?? 0)));
        onChange({ ...light, angle: normalizeAngle(light.angle + (turn ?? 0)), height }, true);
      }}
    />
  );
}
