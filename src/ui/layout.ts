/**
 * Which layout the editor takes, as media queries. The CSS (app.css) has the same ones written out.
 * - The phone's: a narrow touch screen, or a narrow window on a computer. Panels are bottom sheets
 *   and the tools a bar under the thumb.
 * - A tablet's: a touch screen wider than a phone, upright or not. The tools stand in a rail on the
 *   left; upright, the panels open over the drawing.
 */
export const PHONE_QUERY = '(max-width: 699px), (max-width: 820px) and (pointer: fine)';
export const TABLET_QUERY = '(min-width: 700px) and (pointer: coarse)';
