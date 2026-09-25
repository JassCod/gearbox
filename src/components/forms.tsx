import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronDown, X } from 'lucide-react';
import { Modal } from './ui';
import { fmtDMY, parseDMY } from '../lib/ncr';

// ---------- Floating list positioned under a control (portal, so cards never clip it) ----------

function useFloating(open: boolean, anchor: React.RefObject<HTMLElement | null>) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const place = useCallback(() => {
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const up = below < 260 && r.top > below;
    setStyle({
      position: 'fixed', left: r.left, width: Math.max(r.width, 220), zIndex: 80,
      ...(up ? { bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(300, r.top - 12) } : { top: r.bottom + 4, maxHeight: Math.min(300, below - 12) }),
    });
  }, [anchor]);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, place]);
  return style;
}

function useOutside(open: boolean, refs: React.RefObject<HTMLElement | null>[], onOutside: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!refs.some((r) => r.current?.contains(e.target as Node))) onOutside(); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open, refs, onOutside]);
}

// ---------- Combobox: searchable single select ----------

export interface ComboOption {
  value: string;
  label: string;
  /** Secondary text shown at the right of the option. */
  hint?: string;
  /** Status dot shown before the label. */
  dot?: 'green' | 'amber' | 'red';
  /** Extra words to match when searching. */
  keywords?: string;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD');

export function Combobox({ id, value, options, onChange, placeholder = 'Select…', disabled, allowCustom, clearable = true, ariaLabel, footer }: {
  id?: string;
  value: string | undefined;
  options: ComboOption[];
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Accept typed text that isn't in the list (stored as the value). */
  allowCustom?: boolean;
  clearable?: boolean;
  ariaLabel?: string;
  /** Rendered at the bottom of the open list, e.g. "Manage contractors". */
  footer?: (close: () => void, query: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const style = useFloating(open, wrap);
  const selected = options.find((o) => o.value === value);
  const shownLabel = selected?.label ?? (value && allowCustom ? value : value ? `${value} (not in list)` : '');

  const matches = useMemo(() => {
    const q = norm(query.trim());
    const hits = q ? options.filter((o) => norm(`${o.label} ${o.hint ?? ''} ${o.keywords ?? ''}`).includes(q)) : options;
    return hits.slice(0, 300);
  }, [options, query]);
  const custom = allowCustom && query.trim() && !options.some((o) => norm(o.label) === norm(query.trim())) ? query.trim() : '';
  const count = matches.length + (custom ? 1 : 0);

  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);
  useOutside(open, [wrap, list], close);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (v: string | undefined) => { onChange(v); close(); input.current?.blur(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => Math.min(count - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      if (custom && active === matches.length) pick(custom);
      else if (matches[active]) pick(matches[active].value);
    } else if (e.key === 'Escape') { if (open) { e.stopPropagation(); close(); } }
    else if (e.key === 'Tab') close();
  };

  return (
    <div ref={wrap} className={`combo ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`}>
      {selected?.dot && !open && <span className={`dot dot-${selected.dot} combo-dot`} />}
      <input
        ref={input} id={id} className={`input combo-input ${selected?.dot && !open ? 'has-dot' : ''}`} disabled={disabled} autoComplete="off"
        role="combobox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel} aria-autocomplete="list"
        placeholder={shownLabel || placeholder} value={open ? query : shownLabel}
        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={onKey}
      />
      {clearable && value && !disabled && (
        <button type="button" className="combo-clear" aria-label="Clear" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(undefined)}><X size={14} /></button>
      )}
      <ChevronDown size={16} className="combo-chev" aria-hidden />
      {open && createPortal(
        <div ref={list} id={listId} role="listbox" className="combo-list" style={style} onMouseDown={(e) => e.preventDefault()}>
          {matches.map((o, i) => (
            <div key={o.value} data-idx={i} role="option" aria-selected={o.value === value}
              className={`combo-opt ${i === active ? 'active' : ''} ${o.value === value ? 'sel' : ''}`}
              onMouseEnter={() => setActive(i)} onClick={() => pick(o.value)}>
              {o.dot && <span className={`dot dot-${o.dot}`} />}
              <span className="grow">{o.label}</span>
              {o.hint && <span className="small muted">{o.hint}</span>}
              {o.value === value && <Check size={14} />}
            </div>
          ))}
          {custom && (
            <div data-idx={matches.length} role="option" aria-selected={false} className={`combo-opt custom ${active === matches.length ? 'active' : ''}`}
              onMouseEnter={() => setActive(matches.length)} onClick={() => pick(custom)}>Use “{custom}”</div>
          )}
          {count === 0 && <div className="combo-empty">No matches</div>}
          {footer && <div className="combo-foot">{footer(close, query)}</div>}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ---------- MultiSelect: searchable, chips in the control ----------

export function MultiSelect({ values, options, onChange, placeholder, ariaLabel }: {
  values: string[]; options: ComboOption[]; onChange: (v: string[]) => void; placeholder: string; ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const style = useFloating(open, wrap);
  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);
  useOutside(open, [wrap, list], close);
  const q = norm(query.trim());
  const shown = options.filter((o) => !q || norm(o.label).includes(q));
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <div ref={wrap} className={`combo multi ${open ? 'open' : ''}`} onClick={() => setOpen(true)}>
      <div className="input multi-control">
        {values.map((v) => (
          <span key={v} className="multi-chip">{options.find((o) => o.value === v)?.label ?? v}
            <button type="button" aria-label={`Remove ${v}`} onClick={(e) => { e.stopPropagation(); toggle(v); }}><X size={12} /></button></span>
        ))}
        <input className="multi-input" aria-label={ariaLabel} value={query} placeholder={values.length ? '' : placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') close(); if (e.key === 'Backspace' && !query && values.length) onChange(values.slice(0, -1)); }} />
      </div>
      {values.length > 0 && <button type="button" className="combo-clear" aria-label="Clear all" onClick={(e) => { e.stopPropagation(); onChange([]); }}><X size={14} /></button>}
      <ChevronDown size={16} className="combo-chev" aria-hidden />
      {open && createPortal(
        <div ref={list} role="listbox" aria-multiselectable className="combo-list" style={style} onMouseDown={(e) => e.preventDefault()}>
          {shown.map((o) => (
            <div key={o.value} role="option" aria-selected={values.includes(o.value)} className={`combo-opt ${values.includes(o.value) ? 'sel' : ''}`} onClick={() => toggle(o.value)}>
              <span className={`check-box ${values.includes(o.value) ? 'on' : ''}`}>{values.includes(o.value) && <Check size={12} />}</span>
              <span className="grow">{o.label}</span>{o.hint && <span className="small muted">{o.hint}</span>}
            </div>
          ))}
          {!shown.length && <div className="combo-empty">No matches</div>}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ---------- DateField: DD/MM/YYYY text with a calendar picker; value is ISO ----------

export function DateField({ id, value, onChange, disabled, ariaLabel }: {
  id?: string; value: string; onChange: (iso: string) => void; disabled?: boolean; ariaLabel?: string;
}) {
  const [text, setText] = useState(fmtDMY(value));
  const [bad, setBad] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { setText(fmtDMY(value)); setBad(false); }, [value]);
  const commit = () => {
    const iso = parseDMY(text);
    if (iso === null) { setBad(true); return; }
    setBad(false);
    setText(fmtDMY(iso));
    if (iso !== value) onChange(iso);
  };
  const openPicker = () => {
    const el = picker.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };
  return (
    <div className={`date-field ${bad ? 'bad' : ''}`}>
      <input id={id} className="input" inputMode="numeric" placeholder="DD/MM/YYYY" aria-label={ariaLabel} aria-invalid={bad} disabled={disabled}
        value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
      <button type="button" className="date-btn" aria-label="Open calendar" disabled={disabled} onClick={openPicker}><CalendarDays size={15} /></button>
      <input ref={picker} type="date" className="date-native" tabIndex={-1} aria-hidden value={value} onChange={(e) => onChange(e.target.value)} />
      {bad && <span className="date-error">Use DD/MM/YYYY</span>}
    </div>
  );
}

// ---------- Confirm dialog ----------

export function ConfirmModal({ title, children, confirmLabel = 'Confirm', tone = 'danger', onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary'; onConfirm: () => void; onCancel: () => void;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { btn.current?.focus(); }, []);
  return (
    <Modal title={title} onClose={onCancel} footer={<>
      <button className="btn" onClick={onCancel}>Cancel</button>
      <button ref={btn} className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
    </>}>
      {children}
    </Modal>
  );
}
