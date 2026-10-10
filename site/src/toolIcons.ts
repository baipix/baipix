import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ICONS, type IconName } from '../../src/ui/icons';

/**
 * The editor's own icons as SVG markup, rendered at build time: the site shows the same pictures
 * as the toolbar and the panels, without a copy to keep in step.
 */
export const icon = (name: IconName, size = 20): string =>
  renderToStaticMarkup(createElement(ICONS[name], { width: size, height: size, 'aria-hidden': true }));
