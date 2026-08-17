import { KEYBINDS_STORAGE_KEY } from './constants';

export type ActionId =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'dash'
  | 'shoot'
  | 'reload'
  | 'melee'
  | 'swapWeapon'
  | 'weapon1'
  | 'weapon2'
  | 'ability'
  | 'ultimate'
  | 'interact'
  | 'pause'
  | 'upgradesMenu';

export const DEFAULT_BINDINGS: Record<ActionId, string> = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  dash: 'ShiftLeft',
  shoot: 'Space',
  reload: 'KeyR',
  melee: 'KeyV',
  swapWeapon: 'KeyQ',
  weapon1: 'Digit1',
  weapon2: 'Digit2',
  ability: 'KeyE',
  ultimate: 'KeyX',
  interact: 'KeyF',
  pause: 'KeyP',
  upgradesMenu: 'KeyU',
};

export const ACTION_LABELS: Record<ActionId, string> = {
  moveUp: 'Move Up',
  moveDown: 'Move Down',
  moveLeft: 'Move Left',
  moveRight: 'Move Right',
  dash: 'Dash / Dodge Roll',
  shoot: 'Shoot (keyboard)',
  reload: 'Reload',
  melee: 'Melee Finisher',
  swapWeapon: 'Swap Weapon',
  weapon1: 'Select Weapon 1',
  weapon2: 'Select Weapon 2',
  ability: 'Character Ability',
  ultimate: 'Ultimate',
  interact: 'Interact / Buy',
  pause: 'Pause',
  upgradesMenu: 'Upgrades Menu',
};

export const ACTION_ORDER: ActionId[] = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'dash',
  'shoot',
  'reload',
  'melee',
  'swapWeapon',
  'weapon1',
  'weapon2',
  'ability',
  'ultimate',
  'interact',
  'pause',
  'upgradesMenu',
];

export function loadBindings(): Record<ActionId, string> {
  try {
    const raw = localStorage.getItem(KEYBINDS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BINDINGS };
    return { ...DEFAULT_BINDINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

export function saveBindings(bindings: Record<ActionId, string>) {
  try {
    localStorage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // localStorage unavailable - bindings just won't persist
  }
}

const CODE_LABELS: Record<string, string> = {
  Space: 'SPACE',
  ShiftLeft: 'L-SHIFT',
  ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL',
  ControlRight: 'R-CTRL',
  AltLeft: 'ALT',
  AltRight: 'ALT',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backquote: '`',
  Tab: 'TAB',
  CapsLock: 'CAPS',
};

export function formatKeyCode(code: string): string {
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.toUpperCase();
}
