import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { createMenuModel, registerMenuAlt, type MenuDefinition, type MenuItem } from './menuModel.ts';

/** Reusable mouse and keyboard menu surface. */
export function ApplicationMenu({ menus, blocked = false, altAllowed = () => true, canOpen = () => true }: {
  menus: readonly MenuDefinition[]; blocked?: boolean; altAllowed?: () => boolean; canOpen?: () => boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const swallowClick = useRef(false);
  const [snapshot, setSnapshot] = useState({
    state: { menu: 0, path: [] as number[], open: false }, focus: false,
  });
  const state = snapshot.state;
  const model = useMemo(() => createMenuModel(() => menus,
    (state, focus = true) => setSnapshot({ state, focus }), () => {}, state), [menus, state]);
  useLayoutEffect(() => {
    if (snapshot.focus) {
      const key = [state.menu, ...(state.open ? state.path : [])].join('-');
      root.current?.querySelector<HTMLElement>(`[data-menu-focus="${key}"]`)?.focus();
    }
  }, [snapshot, state]);
  useEffect(() => { if (blocked && model.state.open) model.close(); }, [blocked, model]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      swallowClick.current = false;
      if (state.open && event.target instanceof Node && !root.current?.contains(event.target)) {
        const inBar = event.target instanceof Element && event.target.closest('.application-shell__bar');
        if (!inBar) {
          swallowClick.current = true;
          event.preventDefault(); event.stopPropagation();
        }
        model.close(false);
      }
    };
    const click = (event: MouseEvent) => {
      if (swallowClick.current) {
        swallowClick.current = false;
        event.preventDefault(); event.stopPropagation();
      }
    };
    const focusOutside = (event: FocusEvent) => {
      if (state.open && event.target instanceof Node && !root.current?.contains(event.target)) model.close(false);
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('focusin', focusOutside, true);
    window.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('focusin', focusOutside, true);
      window.removeEventListener('click', click, true);
    };
  }, [state.open, model]);
  useEffect(() => registerMenuAlt(window, /Mac|iPhone|iPad/.test(navigator.platform),
    () => !blocked && altAllowed(), () => {
      root.current?.querySelector<HTMLButtonElement>('[data-menu-focus="0"]')?.focus();
    }), [blocked, altAllowed]);
  function surface(items: readonly MenuItem[], path: number[] = []): ReactElement {
    return <div role="menu" className="application-menu__surface"
      id={`${id}-${state.menu}-${path.join('-')}`} aria-label={menus[state.menu]!.label}>
      {items.map((item, index) => {
        if (item.kind === 'separator') return <div key={item.id} role="separator" />;
        if (item.kind === 'header') return <div key={item.id} className="application-menu__heading">{item.label}</div>;
        const next = [...path, index];
        const focused = next.every((value, i) => state.path[i] === value);
        return <div key={item.id} className="application-menu__item">
          <button role="menuitem" type="button" disabled={item.disabled} tabIndex={-1}
            data-menu-focus={[state.menu, ...next].join('-')}
            aria-haspopup={item.children ? 'menu' : undefined}
            aria-expanded={item.children ? focused && state.path.length > next.length : undefined}
            onFocus={() => model.focusItem(next)} onClick={() => model.activate(next)}>
            <span>{item.label}</span>{item.shortcut && <small>{item.shortcut}</small>}
          </button>
          {item.children && focused && state.path.length > next.length ? surface(item.children, next) : null}
        </div>;
      })}
    </div>;
  }
  return <div ref={root} role="menubar" aria-label="Application" className="application-menu"
    onKeyDown={event => {
      event.stopPropagation();
      if (blocked || (!state.open && !canOpen())) return;
      if (model.key(event.key)) event.preventDefault();
    }}>
    {menus.map((menu, index) => <div key={menu.id} className="application-menu__entry">
      <button type="button" role="menuitem" aria-disabled={blocked} aria-haspopup="menu"
        aria-expanded={state.open && state.menu === index}
        aria-controls={state.open && state.menu === index ? `${id}-${index}-` : undefined}
        data-application-menu={menu.id} data-menu-focus={String(index)} tabIndex={index === state.menu ? 0 : -1}
        onPointerDown={event => { if (blocked) event.preventDefault(); }}
        onFocus={() => model.focusButton(index)} onPointerEnter={() => { if (!blocked && canOpen()) model.hover(index); }}
        onClick={() => { if (!blocked && canOpen()) model.toggle(index); }}>
        {menu.label}
      </button>
      {state.open && state.menu === index && !blocked ? surface(menu.items) : null}
    </div>)}
  </div>;
}
