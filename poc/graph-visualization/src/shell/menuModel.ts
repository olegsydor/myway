export interface MenuItem { id: string; label: string; disabled?: boolean; kind?: "header" | "separator"; shortcut?: string; run?: () => void; children?: readonly MenuItem[] }
export interface MenuAction {
  controls: string;
  expanded: boolean;
  disabled: boolean;
  preservePointerFocus?: boolean;
  run: (invoker: HTMLButtonElement) => void;
}
export interface MenuDefinition { id: string; label: string; items: readonly MenuItem[]; action?: MenuAction }
export interface MenuState { menu: number; path: number[]; open: boolean }

export function createMenuModel(menus: () => readonly MenuDefinition[], update: (state: MenuState, restore?: boolean) => void,
  focus: (menu: number, path: readonly number[]) => void,
  initial: MenuState = { menu: 0, path: [], open: false }) {
  let state = initial;
  const itemsAt = (path: readonly number[]) => path.reduce<readonly MenuItem[]>(
    (items, index) => items[index]?.children ?? [], menus()[state.menu]?.items ?? []);
  const publish = (next: MenuState, restore = true) => {
    state = next; update(state, restore);
    if (restore) focus(state.menu, state.open ? state.path : []);
  };
  const first = (items: readonly MenuItem[]) => items.findIndex(item => !item.disabled && !item.kind);
  function close(restore = true) { publish({ ...state, path: [], open: false }, restore); }
  function open(menu: number) {
    if (menus()[menu]?.action) {
      publish({ menu, open: false, path: [] });
      return;
    }
    const index = first(menus()[menu]?.items ?? []);
    publish({ menu, open: true, path: index < 0 ? [] : [index] });
  }
  function activate(path: number[]) {
    const item = itemsAt(path.slice(0, -1))[path.at(-1)!];
    if (!item || item.disabled || item.kind) return;
    if (item.children) {
      const index = first(item.children);
      if (index >= 0) publish({ ...state, path: [...path, index] });
    } else { close(); item.run?.(); }
  }
  return {
    get state() { return state; }, close, open, activate,
    toggle(menu: number) { if (state.open && menu === state.menu) close(); else open(menu); },
    hover(menu: number) { if (state.open && state.menu !== menu && !menus()[menu]?.action) open(menu); },
    key(key: string): boolean {
      if (key === 'Tab') { close(false); return false; }
      if (key === 'Escape') {
        if (state.path.length > 1) publish({ ...state, path: state.path.slice(0, -1) });
        else close();
        return true;
      }
      if (!state.open) {
        if (menus()[state.menu]?.action && (key === 'Enter' || key === ' ')) return false;
        if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(key)) { open(state.menu); return true; }
      } else {
        if (key === 'Enter' || key === ' ') { if (state.path.length) activate(state.path); return true; }
        const parent = state.path.slice(0, -1);
        const items = itemsAt(parent);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
          const enabled = items.flatMap((item, i) => item.disabled || item.kind ? [] : [i]);
          if (enabled.length) {
            const current = enabled.indexOf(state.path.at(-1)!);
            const index = key === 'Home' ? 0 : key === 'End' ? enabled.length - 1 :
              (current + (key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length;
            publish({ ...state, path: [...parent, enabled[index]!] });
          }
          return true;
        }
        if (key === 'ArrowRight' && items[state.path.at(-1)!]?.children) { activate(state.path); return true; }
        if (key === 'ArrowLeft' && parent.length) { publish({ ...state, path: parent }); return true; }
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const menu = (state.menu + (key === 'ArrowLeft' ? -1 : 1) + menus().length) % menus().length;
        if (state.open) open(menu); else publish({ menu, path: [], open: false });
        return true;
      }
      return false;
    },
    focusItem(path: number[]) {
      if (path.join() !== state.path.join()) publish({ ...state, path }, false);
    },
    focusButton(menu: number) { if (!state.open && menu !== state.menu) publish({ ...state, menu }, false); },
  };
}

export function registerMenuAlt(target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  mac: boolean, allowed: () => boolean, focus: () => void) {
  let alone = false;
  let pointerActive = false;
  const down = (event: KeyboardEvent) => {
    alone = !pointerActive && event.key === 'Alt' && !event.repeat && !event.ctrlKey && !event.metaKey &&
      !event.shiftKey && !event.isComposing && allowed();
  };
  const up = (event: KeyboardEvent) => {
    if (event.key === 'Alt') {
      if (alone && !event.isComposing && allowed()) { event.preventDefault(); focus(); }
      alone = false;
    }
  };
  const reset = () => { alone = false; pointerActive = false; };
  const pointerDown = () => { alone = false; pointerActive = true; };
  const pointerUp = () => { pointerActive = false; };
  if (mac) return () => {};
  target.addEventListener('keydown', down, true);
  target.addEventListener('keyup', up, true);
  target.addEventListener('pointerdown', pointerDown, true);
  target.addEventListener('pointerup', pointerUp, true);
  target.addEventListener('pointercancel', pointerUp, true);
  target.addEventListener('blur', reset, true);
  return () => {
    target.removeEventListener('keydown', down, true);
    target.removeEventListener('keyup', up, true);
    target.removeEventListener('pointerdown', pointerDown, true);
    target.removeEventListener('pointerup', pointerUp, true);
    target.removeEventListener('pointercancel', pointerUp, true);
    target.removeEventListener('blur', reset, true);
  };
}
