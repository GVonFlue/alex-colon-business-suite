/* ============================================================================
   ui.jsx — shared primitives. Same class names as the source repo's design
   system (see src/styles.js), so anything built on these looks native.

   The one thing worth reading here is Board: every card carries ‹ › arrow
   buttons as well as drag-and-drop, because the arrows are the only thing that
   works on a touchscreen and realtors live on their phones.
   ========================================================================== */

import React, { useState, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, GripVertical, AlertTriangle } from 'lucide-react';

export const Card = ({ title, sub, right, children, className = '', style }) => (
  <div className={'card ' + className} style={style}>
    {(title || right) && (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: sub ? 4 : 12 }}>
        {title ? <h3 style={{ margin: 0, fontSize: 15.5 }}>{title}</h3> : <span />}
        {right}
      </div>
    )}
    {sub && <div className="ch-sub" style={{ marginBottom: 12 }}>{sub}</div>}
    {children}
  </div>
);

export const SecTitle = ({ children, right }) => (
  <div className="sec-title">{children}{right && <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>{right}</span>}</div>
);

export const Kpi = ({ label, value, d, variant, icon, onClick, active }) => (
  <div className={`kpi ${variant || ''} ${onClick ? 'clickable' : ''} ${active ? 'active' : ''}`} onClick={onClick}>
    <div className="kl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{label}</div>
    <div className="kv">{value}</div>
    {d && <div className="kd">{d}</div>}
  </div>
);

export const Btn = ({ kind = 'g', sm, icon, children, ...rest }) => (
  <button className={`btn btn-${kind}${sm ? ' btn-sm' : ''}`} {...rest}>{icon}{children}</button>
);

export const IconBtn = ({ children, ...rest }) => <button className="iconbtn" {...rest}>{children}</button>;

export const Pill = ({ color, bg, dot, children, style }) => (
  <span className="pill" style={{ background: bg || (color ? color + '1A' : '#EEF0FA'), color: color || '#5A5680', ...style }}>
    {dot !== false && color && <span className="dot" style={{ background: color }} />}{children}
  </span>
);

export const Tag = ({ children, style, className = '' }) => <span className={'tag ' + className} style={style}>{children}</span>;

export const Empty = ({ children }) => <div className="empty">{children}</div>;

export const Field = ({ label, children, full, hint }) => (
  <div className={'field' + (full ? ' full' : '')}>
    {label && <label>{label}</label>}
    {children}
    {hint && <div style={{ fontSize: 11, color: '#928DAD', marginTop: 4 }}>{hint}</div>}
  </div>
);

export const Inp = props => <input {...props} />;
export const Txt = props => <textarea rows={props.rows || 3} {...props} />;
export const Sel = ({ options, children, ...rest }) => (
  <select {...rest}>
    {children}
    {(options || []).map(o => {
      const v = typeof o === 'string' ? o : o.value;
      const l = typeof o === 'string' ? o : o.label;
      return <option key={v} value={v}>{l}</option>;
    })}
  </select>
);

export const Toggle = ({ on, onChange, label, disabled, sm }) => (
  <label className="toggle" style={disabled ? { opacity: .5, cursor: 'not-allowed' } : undefined}
    onClick={e => { e.preventDefault(); if (!disabled && onChange) onChange(!on); }}>
    <span className={`sw${on ? ' on' : ''}${sm ? ' sm' : ''}`}><b /></span>
    {label && <span>{label}</span>}
  </label>
);

export const Seg = ({ value, onChange, options }) => (
  <div className="seg">
    {options.map(o => {
      const v = typeof o === 'string' ? o : o.value;
      const l = typeof o === 'string' ? o : o.label;
      const n = typeof o === 'object' ? o.n : null;
      return (
        <button key={v} className={'seg-b' + (value === v ? ' on' : '')} onClick={() => onChange(v)}>
          {l}{n != null && <span className="seg-n">{n}</span>}
        </button>
      );
    })}
  </div>
);

/* side chip — buyer / seller / both, used everywhere a card or row renders */
export const SideChip = ({ side }) => (
  <span className={side === 'buyer' ? 'side-b' : side === 'seller' ? 'side-s' : 'side-x'}>
    {side === 'buyer' ? 'BUYER' : side === 'seller' ? 'SELLER' : 'BOTH'}
  </span>
);

export const Conf = ({ v }) => {
  if (v == null) return null;
  const n = Number(v);
  const c = n >= 0.85 ? 'hi' : n >= 0.6 ? 'md' : 'lo';
  return <span className={'conf ' + c}>{Math.round(n * 100)}%</span>;
};

export const NeedsEyes = () => <span className="eyes"><AlertTriangle size={10} style={{ verticalAlign: -1 }} /> needs your eyes</span>;

/* ------------------------------------------------------------------- modal */
export function ModalShell({ title, sub, badges, onClose, children, right, foot, width }) {
  return (
    <div className="scrim2" onMouseDown={e => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className="modal" style={width ? { width } : undefined} onMouseDown={e => e.stopPropagation()}>
        <div className="m-head">
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>{title}</h2>
            {sub && <div className="meta">{sub}</div>}
            {badges && <div className="qa">{badges}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {right}
            <button className="m-x" onClick={onClose} aria-label="Close"><X size={17} /></button>
          </div>
        </div>
        {children}
        {foot && <div className="m-foot">{foot}</div>}
      </div>
    </div>
  );
}

export function Drill({ title, sub, onClose, children }) {
  return (
    <div className="scrim2" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drill" onMouseDown={e => e.stopPropagation()}>
        <div className="drill-h">
          <div><div className="drill-t">{title}</div>{sub && <div className="drill-s">{sub}</div>}</div>
          <button className="m-x" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="drill-b">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- board
   Generic kanban. Drag for desktop, ‹ › on every card for touch.
   cols:     [{key,label,color,count?}]
   items:    array
   colOf:    item => column key
   onMove:   (item, nextColKey) => void
   card:     item => JSX for the card body
   Cards are only draggable when onMove is supplied. */
export function Board({ cols, items, colOf, onMove, card, onOpen, empty, footer }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const touched = useRef(false);

  const idx = k => cols.findIndex(c => c.key === k);
  const move = (it, dir) => {
    const i = idx(colOf(it));
    const next = cols[i + dir];
    if (next && onMove) onMove(it, next.key);
  };

  return (
    <div className="kanban">
      {cols.map(col => {
        const list = items.filter(it => colOf(it) === col.key);
        return (
          <div key={col.key} className={'kcol' + (over === col.key ? ' drag' : '')}
            onDragOver={e => { if (drag) { e.preventDefault(); setOver(col.key); } }}
            onDragLeave={() => setOver(o => (o === col.key ? null : o))}
            onDrop={e => {
              e.preventDefault();
              if (drag && onMove && colOf(drag) !== col.key) onMove(drag, col.key);
              setDrag(null); setOver(null);
            }}>
            <div className="kcol-h" style={{ borderTop: `3px solid ${col.color || '#DEDFEA'}` }}>
              <span className="kt">{col.label}</span>
              <span className="kc">{list.length}</span>
            </div>
            <div className="kcol-body">
              {list.length === 0 && <div className="kdrop">{over === col.key ? 'Drop here' : (empty || '—')}</div>}
              {list.map(it => {
                const i = idx(colOf(it));
                return (
                  <div key={it.id} className={'kcard' + (drag && drag.id === it.id ? ' dragging' : '')}
                    draggable={!!onMove}
                    onDragStart={() => { if (!touched.current) setDrag(it); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onClick={() => onOpen && onOpen(it)}
                    onTouchStart={() => { touched.current = true; }}>
                    {card(it)}
                    {onMove && (
                      <div className="kmove" onClick={e => e.stopPropagation()}>
                        <button className="kmv" disabled={i <= 0} title="Move back"
                          onClick={() => move(it, -1)}><ChevronLeft size={15} /></button>
                        <span className="kmv-s">{col.short || col.label}</span>
                        <button className="kmv" disabled={i >= cols.length - 1} title="Move forward"
                          onClick={() => move(it, 1)}><ChevronRight size={15} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
              {footer && footer(col, list)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------- reorderable list
   Used by the dashboard Rearrange button and the settings editors. */
export function Reorder({ items, onChange, render, keyOf }) {
  const k = keyOf || (x => x.key);
  const move = (i, dir) => {
    const next = items.slice();
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div>
      {items.map((it, i) => (
        <div key={k(it)} className="set-row">
          <GripVertical size={14} style={{ color: '#C9C6DC', flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>{render(it, i)}</div>
          <div className="nav-mv">
            <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Up">↑</button>
            <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Down">↓</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export const Spinner = () => <span className="spin" />;

export function ErrorNote({ children }) {
  if (!children) return null;
  return <div className="note bad" style={{ marginTop: 10 }}><AlertTriangle size={13} /> {children}</div>;
}

export const LegalNote = ({ children }) => (
  <div className="legal-note">{children || 'Dates and arithmetic only — this is not legal advice. For anything about obligations or remedies, talk to your broker or an attorney.'}</div>
);
