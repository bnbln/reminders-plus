/**
 * SF Symbols -> Material Icons mapping for Android and web.
 *
 * iOS renders SF Symbols natively via `expo-symbols`. Android has no equivalent, so
 * every symbol the app uses is mapped onto Google's Material Icons, shipped with
 * `@expo/vector-icons`. That set is Android's own design language and is already the
 * family used everywhere else in the app, so mapped icons sit at the same optical
 * weight as the hand-written Android icons rather than looking like a second set.
 *
 * Project icons are free-form strings (users pick them, and Assist can set them), so
 * `resolveMaterialIcon` degrades gracefully for names that aren't listed here.
 */

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';

export type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

/** Rendered when a symbol name has no mapping and no fallback matches. */
export const FALLBACK_MATERIAL_ICON: MaterialIconName = 'help-outline';

const SF_TO_MATERIAL = {
  // Project icon presets
  'folder.fill': 'folder',
  folder: 'folder-open',
  'list.bullet': 'format-list-bulleted',
  'star.fill': 'star',
  star: 'star-border',
  'heart.fill': 'favorite',
  heart: 'favorite-border',
  'flag.fill': 'flag',
  flag: 'outlined-flag',
  'tag.fill': 'local-offer',
  tag: 'label-outline',
  'doc.text.fill': 'description',
  'doc.text': 'description',
  'paintbrush.fill': 'brush',
  paintbrush: 'brush',
  'briefcase.fill': 'work',
  briefcase: 'work-outline',
  'person.2.fill': 'group',
  'person.2': 'group',
  'cart.fill': 'shopping-cart',
  cart: 'shopping-cart',
  'creditcard.fill': 'credit-card',
  creditcard: 'credit-card',
  'gift.fill': 'card-giftcard',
  gift: 'card-giftcard',
  'gamecontroller.fill': 'sports-esports',
  gamecontroller: 'sports-esports',
  headphones: 'headphones',
  airplane: 'flight',
  'tram.fill': 'tram',
  'leaf.fill': 'eco',
  leaf: 'eco',
  'flame.fill': 'local-fire-department',
  flame: 'local-fire-department',
  'trophy.fill': 'emoji-events',
  trophy: 'emoji-events',
  'bolt.fill': 'bolt',
  bolt: 'bolt',

  // Additional project / seed icons
  'books.vertical.fill': 'menu-book',
  'brain.head.profile': 'psychology',
  'figure.mind.and.body': 'self-improvement',
  'flask.fill': 'science',
  flask: 'science',
  'hammer.fill': 'build',
  hammer: 'build',
  'house.fill': 'home',
  house: 'home',
  'icloud.fill': 'cloud',
  icloud: 'cloud',
  'paintpalette.fill': 'palette',
  paintpalette: 'palette',
  'photo.artframe': 'image',
  photo: 'image',
  'safari.fill': 'explore',
  safari: 'explore',
  'shippingbox.fill': 'inventory-2',
  shippingbox: 'inventory-2',
  'location.fill': 'place',
  location: 'place',
  'sun.max.fill': 'wb-sunny',
  'sun.max': 'wb-sunny',
  'moon.fill': 'nightlight-round',
  moon: 'nightlight-round',

  // Navigation & chrome
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'chevron.up': 'expand-less',
  'chevron.down': 'expand-more',
  'chevron.left.forwardslash.chevron.right': 'code',
  'arrow.up.right': 'trending-up',
  'arrow.left': 'arrow-back',
  'arrow.right': 'arrow-forward',
  'arrow.uturn.backward': 'undo',
  'arrow.uturn.forward': 'redo',
  'arrow.clockwise': 'refresh',
  xmark: 'close',
  'xmark.circle.fill': 'cancel',
  plus: 'add',
  'plus.circle.fill': 'add-circle',
  minus: 'remove',
  magnifyingglass: 'search',
  ellipsis: 'more-horiz',
  'ellipsis.circle': 'more-horiz',
  'line.3.horizontal.decrease': 'filter-list',
  'line.3.horizontal': 'menu',
  'square.and.arrow.up': 'ios-share',
  'gearshape.fill': 'settings',
  gearshape: 'settings',
  gear: 'settings',

  // State & actions
  checkmark: 'check',
  'checkmark.circle': 'check-circle-outline',
  'checkmark.circle.fill': 'check-circle',
  'checkmark.square': 'check-box',
  'checkmark.square.fill': 'check-box',
  square: 'check-box-outline-blank',
  'circle.fill': 'circle',
  circle: 'radio-button-unchecked',
  'app.dashed': 'select-all',
  eye: 'visibility',
  'eye.fill': 'visibility',
  'eye.slash': 'visibility-off',
  'eye.slash.fill': 'visibility-off',
  trash: 'delete-outline',
  'trash.fill': 'delete',
  'archivebox.fill': 'archive',
  archivebox: 'archive',
  pencil: 'edit',
  'pencil.circle.fill': 'edit',
  repeat: 'repeat',
  sparkles: 'auto-awesome',
  'questionmark.circle': 'help-outline',
  'questionmark.circle.fill': 'help',
  'exclamationmark.triangle.fill': 'warning',
  'info.circle.fill': 'info',
  'info.circle': 'info-outline',

  // Content
  calendar: 'calendar-today',
  'calendar.badge.clock': 'event-repeat',
  clock: 'schedule',
  'clock.fill': 'schedule',
  'bell.fill': 'notifications',
  bell: 'notifications-none',
  'bell.slash.fill': 'notifications-off',
  'chart.bar.fill': 'insights',
  'chart.bar': 'insights',
  'note.text': 'notes',
  'message.badge.waveform.fill': 'mark-chat-unread',
  'paperplane.fill': 'send',
  paperplane: 'send',
  'person.fill': 'person',
  person: 'person-outline',
  'person.crop.circle.fill': 'account-circle',
  'person.crop.circle': 'account-circle',
  tray: 'inbox',
  'tray.fill': 'inbox',
  'bookmark.fill': 'bookmark',
  bookmark: 'bookmark-border',
  'lock.fill': 'lock',
  lock: 'lock-outline',
  'envelope.fill': 'email',
  envelope: 'email',
  link: 'link',

  // Settings rows
  'circle.lefthalf.filled': 'contrast',
  'app.badge.fill': 'circle-notifications',
  'iphone.radiowaves.left.and.right': 'vibration',
  'figure.walk.motion': 'animation',
  'square.grid.2x2.fill': 'apps',
  'externaldrive.fill': 'backup',
  'wrench.and.screwdriver.fill': 'build',
} as const satisfies Record<string, MaterialIconName>;

export type SFSymbolName = keyof typeof SF_TO_MATERIAL;

const MAP: Record<string, MaterialIconName> = SF_TO_MATERIAL;

/**
 * Resolve an SF Symbol name to a Material icon.
 *
 * Unmapped names fall back progressively rather than dropping straight to a generic
 * icon: the `.fill` variant is tried against its outline sibling (and vice versa),
 * then the name is truncated one dot-component at a time, so e.g. `bell.badge.circle`
 * still lands on `bell`.
 */
export function resolveMaterialIcon(
  name: string | undefined | null,
  fallback: MaterialIconName = FALLBACK_MATERIAL_ICON
): MaterialIconName {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length === 0) return fallback;

  const direct = MAP[trimmed];
  if (direct) return direct;

  // `foo.fill` <-> `foo`
  const swapped = trimmed.endsWith('.fill')
    ? trimmed.slice(0, -'.fill'.length)
    : `${trimmed}.fill`;
  const viaSwap = MAP[swapped];
  if (viaSwap) return viaSwap;

  // Drop trailing components: `bell.badge.circle` -> `bell.badge` -> `bell`
  const parts = trimmed.split('.');
  for (let end = parts.length - 1; end > 0; end -= 1) {
    const prefix = parts.slice(0, end).join('.');
    const viaPrefix = MAP[prefix] ?? MAP[`${prefix}.fill`];
    if (viaPrefix) return viaPrefix;
  }

  return fallback;
}
