/* @ds-bundle: {"format":4,"namespace":"DataFlow_0192ae","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Modal","sourcePath":"components/feedback/Modal.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"SidebarNavItem","sourcePath":"components/navigation/SidebarNavItem.jsx"},{"name":"ConnectorAvatar","sourcePath":"components/pipeline/ConnectorAvatar.jsx"},{"name":"FilterPill","sourcePath":"components/pipeline/FilterPill.jsx"},{"name":"FlowNode","sourcePath":"components/pipeline/FlowNode.jsx"},{"name":"StageBadge","sourcePath":"components/pipeline/StageBadge.jsx"},{"name":"StatTile","sourcePath":"components/pipeline/StatTile.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"6bf03104ace9","components/core/Button.jsx":"5a0362a32ccb","components/core/IconButton.jsx":"884e95185ce6","components/feedback/Modal.jsx":"4ee16493ae92","components/forms/Input.jsx":"b354b1d48616","components/forms/Select.jsx":"fc8d82558851","components/navigation/SidebarNavItem.jsx":"3c5fa08c1fe6","components/pipeline/ConnectorAvatar.jsx":"8d1a503293d4","components/pipeline/FilterPill.jsx":"4becd293c8c9","components/pipeline/FlowNode.jsx":"9e05a5ab4895","components/pipeline/StageBadge.jsx":"e7d480c700a4","components/pipeline/StatTile.jsx":"bf8169538fa9","guidelines/tweaks-panel.jsx":"6591467622ed","ui_kits/pipeline-builder/app.jsx":"14f4bf05f3b7"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DataFlow_0192ae = window.DataFlow_0192ae || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
const TONES = {
  neutral: {
    bgLight: '#f3f4f6',
    textLight: '#4b5563',
    borderLight: '#e5e7eb',
    dot: '#9ca3af'
  },
  success: {
    bgLight: 'var(--success-bg-light)',
    textLight: 'var(--success-text-light)',
    borderLight: 'var(--success-border-light)',
    dot: 'var(--success)'
  },
  warning: {
    bgLight: 'var(--warning-bg-light)',
    textLight: 'var(--warning-text-light)',
    borderLight: 'var(--warning-border-light)',
    dot: 'var(--warning)'
  },
  danger: {
    bgLight: 'var(--danger-bg-light)',
    textLight: 'var(--danger-text-light)',
    borderLight: 'var(--danger-border-light)',
    dot: 'var(--danger)'
  }
};

/** Small pill status label — mirrors .glass-badge* and lifecycle-stage badges. */
function Badge({
  tone = 'neutral',
  dot = false,
  children
}) {
  const t = TONES[tone] || TONES.neutral;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 9px',
      borderRadius: 'var(--radius-pill)',
      fontSize: '11px',
      fontWeight: 'var(--weight-medium)',
      fontFamily: 'var(--font-sans)',
      background: t.bgLight,
      color: t.textLight,
      border: `1px solid ${t.borderLight}`,
      lineHeight: 1
    }
  }, dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: t.dot
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '8px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-body)',
  fontFamily: 'var(--font-sans)',
  fontWeight: 'var(--weight-medium)',
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'all .2s ease',
  lineHeight: 1
};
const VARIANTS = {
  primary: {
    background: 'linear-gradient(180deg, var(--brand-400), var(--brand-600))',
    color: '#fff',
    borderColor: 'rgba(168,157,248,0.3)',
    boxShadow: 'var(--shadow-btn-primary)'
  },
  ghost: {
    background: 'rgba(148,163,184,0.14)',
    color: 'inherit',
    borderColor: 'rgba(148,163,184,0.32)'
  },
  danger: {
    background: 'rgba(248,113,113,0.14)',
    color: '#ef4444',
    borderColor: 'rgba(248,113,113,0.38)'
  },
  success: {
    background: 'linear-gradient(180deg, #34d399, #059669)',
    color: '#fff',
    borderColor: 'rgba(110,231,183,0.3)',
    boxShadow: '0 8px 20px rgba(16,185,129,.15)'
  }
};
const SIZES = {
  sm: {
    padding: '5px 10px',
    fontSize: '12px',
    borderRadius: 'var(--radius-md)'
  },
  md: {},
  lg: {
    padding: '10px 18px',
    fontSize: '14px'
  }
};

/** DataFlow primary UI action — mirrors .glass-btn-* from apps/web/src/index.css. */
function Button({
  variant = 'primary',
  size = 'md',
  disabled,
  children,
  icon,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const v = VARIANTS[variant] || VARIANTS.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      ...BASE,
      ...v,
      ...SIZES[size],
      opacity: disabled ? 0.5 : hover ? 0.92 : 1,
      filter: hover && !disabled ? 'brightness(1.08)' : 'none',
      transform: hover && !disabled ? 'scale(0.98)' : 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      ...style
    }
  }, rest), icon, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Compact square icon-only button — mirrors .icon-button in index.css. */
function IconButton({
  children,
  active = false,
  title,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", _extends({
    title: title,
    "aria-label": title,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 36,
      height: 36,
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${active ? 'rgba(124,108,242,0.2)' : 'var(--border-default)'}`,
      background: active ? 'rgba(124,108,242,0.15)' : hover ? '#f3f4f6' : '#f9fafb',
      color: active ? 'var(--brand-500)' : hover ? '#374151' : '#9ca3af',
      cursor: 'pointer',
      transition: 'all .2s ease'
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Modal.jsx
try { (() => {
/** Centered dialog with backdrop blur — mirrors .glass-modal-backdrop / .glass-modal. */
function Modal({
  title,
  onClose,
  children,
  footer,
  width = 420
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,.4)',
      backdropFilter: 'blur(var(--blur-glass-heavy))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: '#fff',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-xl)',
      padding: 24,
      width,
      maxWidth: 'calc(100% - 32px)',
      boxShadow: 'var(--shadow-modal-light)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 17,
      fontWeight: 'var(--weight-semibold)',
      margin: 0,
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-sans)'
    }
  }, title), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    style: {
      width: 32,
      height: 32,
      borderRadius: 'var(--radius-md)',
      border: 'none',
      background: 'var(--gray-100)',
      color: 'var(--text-secondary)',
      fontSize: 16,
      cursor: 'pointer'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body)',
      color: 'var(--text-primary)'
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 20
    }
  }, footer)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Modal.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
/** Single-line field — mirrors .glass-input. Pass `icon` as a small ReactNode (e.g. an inline svg or lucide element) for a leading glyph. */
function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  icon,
  disabled = false,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 10,
      width: 13,
      height: 13,
      color: 'var(--text-tertiary)',
      pointerEvents: 'none',
      display: 'flex'
    }
  }, icon), /*#__PURE__*/React.createElement("input", {
    type: type,
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    disabled: disabled,
    style: {
      width: '100%',
      background: 'var(--gray-50)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: icon ? '8px 12px 8px 30px' : '8px 12px',
      fontSize: 'var(--text-body)',
      color: 'var(--text-primary)',
      outline: 'none',
      fontFamily: 'var(--font-sans)',
      transition: 'all var(--duration-standard) var(--ease-standard)'
    }
  }));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function Select({
  value,
  onChange,
  options,
  disabled = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: onChange,
    disabled: disabled,
    style: {
      width: '100%',
      appearance: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: 'var(--gray-50)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: '8px 30px 8px 12px',
      fontSize: 'var(--text-body)',
      color: 'var(--text-primary)',
      outline: 'none',
      fontFamily: 'var(--font-sans)'
    }
  }, options.map(o => /*#__PURE__*/React.createElement("option", {
    key: typeof o === 'string' ? o : o.value,
    value: typeof o === 'string' ? o : o.value
  }, typeof o === 'string' ? o : o.label))), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: 10,
      top: '50%',
      transform: 'translateY(-50%)',
      fontSize: 10,
      color: 'var(--text-tertiary)',
      pointerEvents: 'none'
    }
  }, "\u25BE"));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SidebarNavItem.jsx
try { (() => {
/** 36px nav-rail item with hover tooltip — mirrors the AppShell sidebar icons. */
function SidebarNavItem({
  icon,
  label,
  active = false
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 36,
      height: 36,
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer',
      border: `1px solid ${active ? 'rgba(168,157,248,.2)' : 'transparent'}`,
      background: active ? 'rgba(124,108,242,.15)' : hover ? 'var(--gray-100)' : 'transparent',
      color: active ? 'var(--brand-500)' : hover ? 'var(--gray-700)' : 'var(--gray-400)'
    }
  }, icon), hover && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 46,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 10,
      whiteSpace: 'nowrap',
      padding: '4px 8px',
      borderRadius: 8,
      fontSize: 11,
      background: 'rgba(17,24,39,.95)',
      color: '#fff',
      fontFamily: 'var(--font-sans)',
      boxShadow: '0 8px 20px rgba(0,0,0,.25)'
    }
  }, label));
}
Object.assign(__ds_scope, { SidebarNavItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SidebarNavItem.jsx", error: String((e && e.message) || e) }); }

// components/pipeline/ConnectorAvatar.jsx
try { (() => {
/** Gradient provider avatar — mirrors ProviderIcon in ConnectorsPage.tsx. Pass any small ReactNode icon. */
function ConnectorAvatar({
  icon,
  from = '#6b7280',
  to = '#4b5563',
  size = 40
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: 'var(--radius-lg)',
      background: `linear-gradient(135deg, ${from}, ${to})`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      boxShadow: '0 4px 14px rgba(0,0,0,.15)',
      flexShrink: 0
    }
  }, icon);
}
Object.assign(__ds_scope, { ConnectorAvatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/pipeline/ConnectorAvatar.jsx", error: String((e && e.message) || e) }); }

// components/pipeline/FilterPill.jsx
try { (() => {
/** Toolbar filter chip with a count — mirrors the pill row atop PipelinesPage/RunsPage. Pass `dark` since the app toggles theme via inline styles, not a CSS class. */
function FilterPill({
  label,
  count,
  dotColor,
  active = false,
  onClick,
  dark = false
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 12px',
      borderRadius: 'var(--radius-pill)',
      fontSize: 11,
      fontWeight: 'var(--weight-medium)',
      fontFamily: 'var(--font-sans)',
      cursor: 'pointer',
      border: `1px solid ${active ? dark ? '#e5e7eb' : '#111827' : dark ? 'rgba(255,255,255,.14)' : 'var(--border-default)'}`,
      background: active ? dark ? '#e5e7eb' : '#111827' : 'transparent',
      color: active ? dark ? '#111827' : '#fff' : dark ? 'rgba(255,255,255,.55)' : 'var(--text-secondary)'
    }
  }, dotColor && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: dotColor
    }
  }), label, count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      color: active ? dark ? 'rgba(17,24,39,.6)' : 'rgba(255,255,255,.6)' : dark ? 'rgba(255,255,255,.35)' : 'var(--text-tertiary)',
      marginLeft: 2
    }
  }, count));
}
Object.assign(__ds_scope, { FilterPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/pipeline/FilterPill.jsx", error: String((e && e.message) || e) }); }

// components/pipeline/FlowNode.jsx
try { (() => {
const STATUS_DOT = {
  failed: '#f87171',
  success: '#34d399',
  running: '#fbbf24'
};

/** Pipeline-canvas node card — mirrors FlowNode.tsx: left accent bar, icon tile, label, status dot, record count. */
function FlowNode({
  label,
  sublabel,
  icon,
  color = '#6965db',
  status,
  recordCount
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      minWidth: 190,
      borderRadius: 'var(--radius-lg)',
      padding: '12px 14px',
      background: '#fff',
      border: '1px solid var(--border-default)',
      boxShadow: 'var(--shadow-node-light)',
      fontFamily: 'var(--font-sans)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      insetBlock: 0,
      left: 0,
      width: 3,
      background: color
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 'var(--radius-md)',
      background: 'var(--gray-50)',
      border: '1px solid var(--gray-100)',
      color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--text-primary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, label), sublabel && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--text-tertiary)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, sublabel)), status && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: STATUS_DOT[status] || '#d1d5db',
      flexShrink: 0
    }
  })), recordCount != null && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      fontSize: 10,
      color: 'var(--text-tertiary)'
    }
  }, recordCount.toLocaleString(), " records"));
}
Object.assign(__ds_scope, { FlowNode });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/pipeline/FlowNode.jsx", error: String((e && e.message) || e) }); }

// components/pipeline/StageBadge.jsx
try { (() => {
const STAGES = {
  draft: {
    label: 'Draft',
    bg: '#fffbeb',
    border: '#fde68a',
    text: '#b45309'
  },
  testing: {
    label: 'Integration',
    bg: '#eff6ff',
    border: '#bfdbfe',
    text: '#1d4ed8'
  },
  production: {
    label: 'Production',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    text: '#047857'
  },
  archived: {
    label: 'Archived',
    bg: '#f9fafb',
    border: '#e5e7eb',
    text: '#9ca3af'
  }
};

/** Lifecycle-stage pill — draft / testing / production / archived (LifecyclePage, PipelinesPage). `size="md"` for prominent placements like a detail-drawer header. */
function StageBadge({
  stage = 'draft',
  size = 'sm'
}) {
  const s = STAGES[stage] || STAGES.draft;
  const dims = size === 'md' ? {
    padding: '5px 14px',
    fontSize: 13
  } : {
    padding: '2px 8px',
    fontSize: 10
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: 'var(--radius-pill)',
      fontWeight: 'var(--weight-semibold)',
      fontFamily: 'var(--font-sans)',
      background: s.bg,
      border: `1px solid ${s.border}`,
      color: s.text,
      ...dims
    }
  }, s.label);
}
Object.assign(__ds_scope, { StageBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/pipeline/StageBadge.jsx", error: String((e && e.message) || e) }); }

// components/pipeline/StatTile.jsx
try { (() => {
/** Small stat readout — mirrors the 3-column success-rate/runs/last-run row in the pipeline drawer. Pass `dark` since the app toggles theme via inline styles, not a CSS class. */
function StatTile({
  value,
  label,
  highlight = false,
  dark = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 0',
      textAlign: 'center',
      flex: 1,
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 17,
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: '-0.02em',
      color: highlight ? '#10b981' : dark ? 'rgba(255,255,255,.9)' : 'var(--text-primary)'
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: dark ? 'rgba(255,255,255,.35)' : 'var(--text-tertiary)',
      marginTop: 2
    }
  }, label));
}
Object.assign(__ds_scope, { StatTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/pipeline/StatTile.jsx", error: String((e && e.message) || e) }); }

// guidelines/tweaks-panel.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
// Exports (to window): useTweaks, TweaksPanel, TweakSection, TweakRow, TweakSlider,
//   TweakToggle, TweakRadio, TweakSelect, TweakText, TweakNumber, TweakColor, TweakButton.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// TweakRadio is the segmented control for 2–3 short options (auto-falls-back to
// TweakSelect past ~16/~10 chars per label); reach for TweakSelect directly when
// options are many or long. For color tweaks always curate 3-4 options rather than
// a free picker; an option can also be a whole 2–5 color palette (the stored value
// is the array). The Tweak* controls are a floor, not a ceiling — build custom
// controls inside the panel if a tweak calls for UI they don't cover.
/* END USAGE */
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null ? keyOrEdits : {
      [keyOrEdits]: val
    };
    setValues(prev => ({
      ...prev,
      ...edits
    }));
    window.parent.postMessage({
      type: '__edit_mode_set_keys',
      edits
    }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', {
      detail: edits
    }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({
  title = 'Tweaks',
  children
}) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({
    x: 16,
    y: 16
  });
  const PAD = 16;
  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth,
      h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y))
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);
  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);
  React.useEffect(() => {
    const onMsg = e => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({
      type: '__edit_mode_available'
    }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);
  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({
      type: '__edit_mode_dismissed'
    }, '*');
  };
  const onDragStart = e => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX,
      sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = ev => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy)
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  if (!open) return null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("style", null, __TWEAKS_STYLE), /*#__PURE__*/React.createElement("div", {
    ref: dragRef,
    className: "twk-panel",
    "data-omelette-chrome": "",
    style: {
      right: offsetRef.current.x,
      bottom: offsetRef.current.y
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-hd",
    onMouseDown: onDragStart
  }, /*#__PURE__*/React.createElement("b", null, title), /*#__PURE__*/React.createElement("button", {
    className: "twk-x",
    "aria-label": "Close tweaks",
    onMouseDown: e => e.stopPropagation(),
    onClick: dismiss
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "twk-body"
  }, children)));
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "twk-sect"
  }, label), children);
}
function TweakRow({
  label,
  value,
  children,
  inline = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: inline ? 'twk-row twk-row-h' : 'twk-row'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label), value != null && /*#__PURE__*/React.createElement("span", {
    className: "twk-val"
  }, value)), children);
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label,
    value: `${value}${unit}`
  }, /*#__PURE__*/React.createElement("input", {
    type: "range",
    className: "twk-slider",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: e => onChange(Number(e.target.value))
  }));
}
function TweakToggle({
  label,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-row twk-row-h"
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-lbl"
  }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "twk-toggle",
    "data-on": value ? '1' : '0',
    role: "switch",
    "aria-checked": !!value,
    onClick: () => onChange(!value)
  }, /*#__PURE__*/React.createElement("i", null)));
}
function TweakRadio({
  label,
  value,
  options,
  onChange
}) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = o => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({
    2: 16,
    3: 10
  }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = s => {
      const m = options.find(o => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return /*#__PURE__*/React.createElement(TweakSelect, {
      label: label,
      value: value,
      options: options,
      onChange: s => onChange(resolve(s))
    });
  }
  const opts = options.map(o => typeof o === 'object' ? o : {
    value: o,
    label: o
  });
  const idx = Math.max(0, opts.findIndex(o => o.value === value));
  const n = opts.length;
  const segAt = clientX => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor((clientX - r.left - 2) / inner * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };
  const onPointerDown = e => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = ev => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    ref: trackRef,
    role: "radiogroup",
    onPointerDown: onPointerDown,
    className: dragging ? 'twk-seg dragging' : 'twk-seg'
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-seg-thumb",
    style: {
      left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
      width: `calc((100% - 4px) / ${n})`
    }
  }), opts.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    type: "button",
    role: "radio",
    "aria-checked": o.value === value
  }, o.label))));
}
function TweakSelect({
  label,
  value,
  options,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("select", {
    className: "twk-field",
    value: value,
    onChange: e => onChange(e.target.value)
  }, options.map(o => {
    const v = typeof o === 'object' ? o.value : o;
    const l = typeof o === 'object' ? o.label : o;
    return /*#__PURE__*/React.createElement("option", {
      key: v,
      value: v
    }, l);
  })));
}
function TweakText({
  label,
  value,
  placeholder,
  onChange
}) {
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("input", {
    className: "twk-field",
    type: "text",
    value: value,
    placeholder: placeholder,
    onChange: e => onChange(e.target.value)
  }));
}
function TweakNumber({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange
}) {
  const clamp = n => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({
    x: 0,
    val: 0
  });
  const onScrubStart = e => {
    e.preventDefault();
    startRef.current = {
      x: e.clientX,
      val: value
    };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = ev => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "twk-num"
  }, /*#__PURE__*/React.createElement("span", {
    className: "twk-num-lbl",
    onPointerDown: onScrubStart
  }, label), /*#__PURE__*/React.createElement("input", {
    type: "number",
    value: value,
    min: min,
    max: max,
    step: step,
    onChange: e => onChange(clamp(Number(e.target.value)))
  }), unit && /*#__PURE__*/React.createElement("span", {
    className: "twk-num-unit"
  }, unit));
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, c => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = n >> 16 & 255,
    g = n >> 8 & 255,
    b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}
const __TwkCheck = ({
  light
}) => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 14 14",
  "aria-hidden": "true"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 7.2 5.8 10 11 4.2",
  fill: "none",
  strokeWidth: "2.2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  stroke: light ? 'rgba(0,0,0,.78)' : '#fff'
}));

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({
  label,
  value,
  options,
  onChange
}) {
  if (!options || !options.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "twk-row twk-row-h"
    }, /*#__PURE__*/React.createElement("div", {
      className: "twk-lbl"
    }, /*#__PURE__*/React.createElement("span", null, label)), /*#__PURE__*/React.createElement("input", {
      type: "color",
      className: "twk-swatch",
      value: value,
      onChange: e => onChange(e.target.value)
    }));
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = o => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return /*#__PURE__*/React.createElement(TweakRow, {
    label: label
  }, /*#__PURE__*/React.createElement("div", {
    className: "twk-chips",
    role: "radiogroup"
  }, options.map((o, i) => {
    const colors = Array.isArray(o) ? o : [o];
    const [hero, ...rest] = colors;
    const sup = rest.slice(0, 4);
    const on = key(o) === cur;
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      type: "button",
      className: "twk-chip",
      role: "radio",
      "aria-checked": on,
      "data-on": on ? '1' : '0',
      "aria-label": colors.join(', '),
      title: colors.join(' · '),
      style: {
        background: hero
      },
      onClick: () => onChange(o)
    }, sup.length > 0 && /*#__PURE__*/React.createElement("span", null, sup.map((c, j) => /*#__PURE__*/React.createElement("i", {
      key: j,
      style: {
        background: c
      }
    }))), on && /*#__PURE__*/React.createElement(__TwkCheck, {
      light: __twkIsLight(hero)
    }));
  })));
}
function TweakButton({
  label,
  onClick,
  secondary = false
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: secondary ? 'twk-btn secondary' : 'twk-btn',
    onClick: onClick
  }, label);
}
Object.assign(window, {
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRow,
  TweakSlider,
  TweakToggle,
  TweakRadio,
  TweakSelect,
  TweakText,
  TweakNumber,
  TweakColor,
  TweakButton
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "guidelines/tweaks-panel.jsx", error: String((e && e.message) || e) }); }

// ui_kits/pipeline-builder/app.jsx
try { (() => {
// AppShellChrome — sidebar nav rail + top header, mirrors apps/web/src/components/AppShell.tsx
const {
  SidebarNavItem,
  IconButton,
  Button,
  Input,
  Select,
  Modal,
  StageBadge,
  FilterPill,
  StatTile,
  ConnectorAvatar,
  FlowNode
} = window.DataFlow_0192ae;
const Ic = (name, size = 17) => /*#__PURE__*/React.createElement("i", {
  "data-lucide": name,
  style: {
    width: size,
    height: size
  }
});

// Atom mark: nucleus (proton + neutron) with two orbit rings
const AtomMark = ({
  size = 20
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none"
}, /*#__PURE__*/React.createElement("ellipse", {
  cx: "12",
  cy: "12",
  rx: "9.5",
  ry: "4",
  stroke: "rgba(255,255,255,.85)",
  strokeWidth: "1.4",
  transform: "rotate(-28 12 12)"
}), /*#__PURE__*/React.createElement("ellipse", {
  cx: "12",
  cy: "12",
  rx: "9.5",
  ry: "4",
  stroke: "rgba(255,255,255,.55)",
  strokeWidth: "1.4",
  transform: "rotate(28 12 12)"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "10.6",
  cy: "12.6",
  r: "2.1",
  fill: "#fff"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "13.5",
  cy: "11.2",
  r: "2.1",
  fill: "rgba(255,255,255,.65)"
}));
const NAV = [{
  key: 'pipelines',
  label: 'Pipelines',
  icon: 'workflow'
}, {
  key: 'lifecycle',
  label: 'Lifecycle',
  icon: 'orbit'
}, {
  key: 'runs',
  label: 'Runs',
  icon: 'history'
}, {
  key: 'monitoring',
  label: 'Monitoring',
  icon: 'gauge'
}, {
  key: 'lineage',
  label: 'Lineage',
  icon: 'network'
}, {
  key: 'connectors',
  label: 'Connectors',
  icon: 'cable'
}, {
  key: 'analytics',
  label: 'Analytics',
  icon: 'bar-chart-3'
}, {
  key: 'team',
  label: 'Team',
  icon: 'users'
}, {
  key: 'billing',
  label: 'Billing',
  icon: 'credit-card'
}];
const META = {
  pipelines: {
    eyebrow: 'Build & orchestrate',
    title: 'Pipelines'
  },
  canvas: {
    eyebrow: 'Design a pipeline',
    title: 'New pipeline'
  },
  connectors: {
    eyebrow: 'Data sources',
    title: 'Connect accounts'
  }
};
function AppShellChrome({
  route,
  setRoute,
  dark,
  setDark,
  children
}) {
  React.useEffect(() => {
    window.lucide?.createIcons();
  });
  const meta = META[route] || META.pipelines;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      fontFamily: 'var(--font-sans)',
      background: dark ? 'radial-gradient(ellipse at 18% 0%, rgba(124,108,242,.15) 0%, transparent 38%), radial-gradient(ellipse at 90% 82%, rgba(82,214,232,.08) 0%, transparent 34%), linear-gradient(145deg, #080a10 0%, #0b0e17 48%, #080a10 100%)' : '#f5f7fa',
      color: dark ? 'rgba(255,255,255,.9)' : '#111827'
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 52,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      padding: '12px 0',
      borderRight: `1px solid ${dark ? 'rgba(255,255,255,.08)' : '#e5e7eb'}`,
      background: dark ? 'rgba(13,15,23,.95)' : 'rgba(255,255,255,.95)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => setRoute('pipelines'),
    title: "DataFlow \u2014 Home",
    style: {
      width: 36,
      height: 36,
      borderRadius: 10,
      marginBottom: 8,
      cursor: 'pointer',
      background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 14px rgba(124,108,242,.3)',
      color: '#fff',
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement(AtomMark, {
    size: 22
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 1,
      background: dark ? 'rgba(255,255,255,.08)' : '#e5e7eb',
      margin: '4px 0'
    }
  }), NAV.map(n => /*#__PURE__*/React.createElement("div", {
    key: n.key,
    onClick: () => setRoute(n.key === 'pipelines' ? 'pipelines' : n.key === 'connectors' ? 'connectors' : route)
  }, /*#__PURE__*/React.createElement(SidebarNavItem, {
    icon: Ic(n.icon),
    label: n.label,
    active: route === n.key || route === 'canvas' && n.key === 'pipelines'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 1,
      background: dark ? 'rgba(255,255,255,.08)' : '#e5e7eb',
      margin: '4px 0'
    }
  }), /*#__PURE__*/React.createElement(IconButton, {
    title: dark ? 'Light mode' : 'Dark mode',
    onClick: () => setDark(!dark)
  }, Ic(dark ? 'sun' : 'moon', 15)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: '50%',
      border: `1px solid ${dark ? 'rgba(255,255,255,.1)' : '#e5e7eb'}`,
      background: dark ? 'rgba(255,255,255,.06)' : '#f9fafb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      fontWeight: 600,
      color: dark ? 'rgba(255,255,255,.7)' : '#4b5563',
      position: 'relative'
    }
  }, "DF", /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: 9,
      height: 9,
      borderRadius: '50%',
      background: '#34d399',
      border: `2px solid ${dark ? '#0a0c12' : '#fff'}`
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      height: 56,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      borderBottom: `1px solid ${dark ? 'rgba(255,255,255,.06)' : '#e5e7eb'}`,
      background: dark ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.9)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: '.16em',
      textTransform: 'uppercase',
      color: dark ? 'rgba(255,255,255,.28)' : '#9ca3af',
      whiteSpace: 'nowrap'
    },
    "data-comment-anchor": "b4e05a37c1-p-74-13"
  }, meta.eyebrow), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: '2px 0 0',
      fontSize: 15,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      whiteSpace: 'nowrap'
    }
  }, meta.title)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", null, "demo@dataflow.dev"), /*#__PURE__*/React.createElement("span", {
    style: {
      padding: '3px 9px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 500,
      background: dark ? 'rgba(255,255,255,.055)' : '#f3f4f6',
      border: `1px solid ${dark ? 'rgba(255,255,255,.09)' : '#e5e7eb'}`
    }
  }, "admin"))), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      overflowY: 'auto',
      minHeight: 0
    }
  }, children)));
}

// PipelinesScreen — list + drawer, mirrors apps/web/src/pages/PipelinesPage.tsx
const PIcon = (name, size = 13) => /*#__PURE__*/React.createElement("i", {
  "data-lucide": name,
  style: {
    width: size,
    height: size
  }
});
const PIPELINES = [{
  id: 1,
  name: 'zendesk-tickets-sync',
  stage: 'production',
  trigger: 'Cron · */30 * * * *',
  nodes: [['badge-help', '#1D9E75'], ['filter', '#D85A30'], ['database', '#639922']],
  last: 'completed',
  lastAgo: '4m ago'
}, {
  id: 2,
  name: 'gsheets-orders-bronze',
  stage: 'testing',
  trigger: 'Manual',
  nodes: [['sheet', '#1D9E75'], ['git-fork', '#7F77DD'], ['hard-drive', '#639922']],
  last: 'running',
  lastAgo: 'now'
}, {
  id: 3,
  name: 'postgres-to-snowflake',
  stage: 'draft',
  trigger: 'Webhook',
  nodes: [['database', '#336791'], ['file-json', '#D85A30'], ['database', '#29B5E8']],
  last: 'never',
  lastAgo: '—'
}, {
  id: 4,
  name: 'kafka-events-silver',
  stage: 'production',
  trigger: 'Cron · @hourly',
  nodes: [['workflow', '#7C3AED'], ['merge', '#7F77DD'], ['database', '#F4C430']],
  last: 'failed',
  lastAgo: '1h ago'
}, {
  id: 5,
  name: 'excel-inventory-gold',
  stage: 'archived',
  trigger: 'Manual',
  nodes: [['file-spreadsheet', '#1D9E75'], ['database', '#639922']],
  last: 'completed',
  lastAgo: '3d ago'
}];
const STAGE_FILTERS = [{
  key: 'all',
  label: 'All'
}, {
  key: 'production',
  label: 'Production',
  dot: '#34d399'
}, {
  key: 'testing',
  label: 'Integration',
  dot: '#60a5fa'
}, {
  key: 'draft',
  label: 'Draft',
  dot: '#fbbf24'
}];
const TRIGGER_FILTERS = [{
  key: 'all',
  label: 'All triggers'
}, {
  key: 'cron',
  label: 'Cron'
}, {
  key: 'manual',
  label: 'Manual'
}, {
  key: 'webhook',
  label: 'Webhook'
}];
function triggerType(trigger) {
  if (trigger.startsWith('Cron')) return 'cron';
  if (trigger === 'Manual') return 'manual';
  if (trigger === 'Webhook') return 'webhook';
  return 'other';
}
const TRIGGER_ICON = {
  cron: 'clock',
  manual: 'hand',
  webhook: 'webhook',
  other: 'help-circle'
};
function RunDot({
  phase
}) {
  const c = phase === 'completed' ? '#10b981' : phase === 'failed' ? '#ef4444' : phase === 'running' ? '#22d3ee' : '#d1d5db';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: c,
      display: 'inline-block',
      animation: phase === 'running' ? 'pulse 1.4s infinite' : 'none'
    }
  });
}
function runLabel(phase) {
  return {
    completed: 'Success',
    failed: 'Failed',
    running: 'Running',
    never: 'Never run'
  }[phase];
}
function PipelineDrawer({
  pipeline,
  onClose,
  onEdit,
  dark
}) {
  const border = dark ? 'rgba(255,255,255,.08)' : '#e5e7eb';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 380,
      flexShrink: 0,
      borderLeft: `1px solid ${border}`,
      background: dark ? 'rgba(255,255,255,.04)' : '#fff',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: dark ? '-18px 0 50px rgba(0,0,0,.28)' : '-18px 0 50px rgba(0,0,0,.08)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 20px 14px',
      borderBottom: `1px solid ${border}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      letterSpacing: '-0.01em'
    }
  }, pipeline.name), /*#__PURE__*/React.createElement("span", {
    style: {
      transform: 'scale(.85)',
      transformOrigin: 'left center',
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement(StageBadge, {
    stage: pipeline.stage
  })), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      marginLeft: 'auto',
      width: 24,
      height: 24,
      borderRadius: 6,
      border: `1px solid ${border}`,
      background: 'transparent',
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      flexShrink: 0
    }
  }, PIcon('x', 13))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: dark ? 'rgba(255,255,255,.35)' : '#9ca3af',
      marginTop: 3,
      display: 'flex',
      gap: 5,
      alignItems: 'center'
    }
  }, PIcon('clock', 11), " v3 \xB7 ", pipeline.trigger), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    icon: PIcon('pencil', 12),
    onClick: onEdit
  }, "Edit"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    icon: PIcon('play', 11)
  }, "Run now"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    icon: PIcon('rotate-ccw', 12)
  }, "Backfill"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      borderBottom: `1px solid ${border}`
    }
  }, /*#__PURE__*/React.createElement(StatTile, {
    value: "92%",
    label: "Success rate",
    highlight: true,
    dark: dark
  }), /*#__PURE__*/React.createElement(StatTile, {
    value: "30",
    label: "Runs (recent)",
    dark: dark
  }), /*#__PURE__*/React.createElement(StatTile, {
    value: pipeline.lastAgo,
    label: "Last run",
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto'
    }
  }, [1, 2, 3].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 20px',
      borderBottom: `1px solid ${dark ? 'rgba(255,255,255,.05)' : '#f3f4f6'}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 26,
      height: 26,
      borderRadius: 7,
      background: '#ecfdf5',
      color: '#059669',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: 12,
      flexShrink: 0
    }
  }, "\u2713"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontSize: 12
    }
  }, i * 12, "m ago ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af'
    }
  }, 1200 + i * 40, " rows")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af'
    }
  }, 2 + i, ".", i, "s")))));
}
function PipelinesScreen({
  dark,
  onOpenCanvas
}) {
  const [stageFilter, setStageFilter] = React.useState('all');
  const [triggerFilter, setTriggerFilter] = React.useState('all');
  const [failedOnly, setFailedOnly] = React.useState(false);
  const [selected, setSelected] = React.useState(null);
  React.useEffect(() => {
    window.lucide?.createIcons();
  });
  const border = dark ? 'rgba(255,255,255,.08)' : '#f3f4f6';
  const visible = PIPELINES.filter(p => (stageFilter === 'all' || p.stage === stageFilter) && (triggerFilter === 'all' || triggerType(p.trigger) === triggerFilter) && (!failedOnly || p.last === 'failed'));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '10px 24px',
      borderBottom: `1px solid ${border}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '.06em',
      color: dark ? 'rgba(255,255,255,.28)' : '#9ca3af',
      marginRight: 2
    }
  }, "Stage"), STAGE_FILTERS.map(f => /*#__PURE__*/React.createElement(FilterPill, {
    key: f.key,
    label: f.label,
    dotColor: f.dot,
    dark: dark,
    count: f.key === 'all' ? PIPELINES.length : PIPELINES.filter(p => p.stage === f.key).length,
    active: stageFilter === f.key,
    onClick: () => setStageFilter(f.key)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 8,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    icon: PIcon('search', 12),
    placeholder: "Search\u2026",
    style: {
      width: 150,
      fontSize: 12
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    onClick: onOpenCanvas
  }, "+ New"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '.06em',
      color: dark ? 'rgba(255,255,255,.28)' : '#9ca3af',
      marginRight: 2
    }
  }, "Trigger"), TRIGGER_FILTERS.map(f => /*#__PURE__*/React.createElement(FilterPill, {
    key: f.key,
    label: f.label,
    dark: dark,
    active: triggerFilter === f.key,
    onClick: () => setTriggerFilter(f.key)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setFailedOnly(v => !v),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      padding: '2px 0',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 30,
      height: 17,
      borderRadius: 999,
      position: 'relative',
      flexShrink: 0,
      background: failedOnly ? '#ef4444' : dark ? 'rgba(255,255,255,.14)' : '#e5e7eb',
      transition: 'background .15s ease'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 2,
      left: failedOnly ? 15 : 2,
      width: 13,
      height: 13,
      borderRadius: '50%',
      background: '#fff',
      transition: 'left .15s ease',
      boxShadow: '0 1px 2px rgba(0,0,0,.3)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: failedOnly ? '#ef4444' : dark ? 'rgba(255,255,255,.55)' : '#6b7280'
    }
  }, "Only show last-run failures", PIPELINES.filter(p => p.last === 'failed').length > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 5,
      color: dark ? 'rgba(255,255,255,.3)' : '#9ca3af'
    }
  }, "(", PIPELINES.filter(p => p.last === 'failed').length, ")"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto'
    }
  }, visible.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    onClick: () => setSelected(selected?.id === p.id ? null : p),
    style: {
      display: 'flex',
      borderBottom: `1px solid ${border}`,
      cursor: 'pointer',
      background: selected?.id === p.id ? dark ? 'rgba(124,108,242,.06)' : '#f5f3ff' : 'transparent'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 3,
      background: p.stage === 'production' ? '#34d399' : p.stage === 'testing' ? '#60a5fa' : p.stage === 'draft' ? '#fbbf24' : '#d1d5db'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '13px 20px',
      minWidth: 0,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    title: p.trigger,
    style: {
      width: 26,
      height: 26,
      borderRadius: 7,
      border: `1px solid ${dark ? 'rgba(255,255,255,.1)' : '#e5e7eb'}`,
      background: dark ? 'rgba(255,255,255,.05)' : '#f9fafb',
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, PIcon(TRIGGER_ICON[triggerType(p.trigger)], 13)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 140
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 500
    }
  }, p.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement(StageBadge, {
    stage: p.stage
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 11,
      color: dark ? 'rgba(255,255,255,.5)' : '#6b7280'
    }
  }, /*#__PURE__*/React.createElement(RunDot, {
    phase: p.last
  }), runLabel(p.last)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: dark ? 'rgba(255,255,255,.28)' : '#9ca3af',
      width: 56,
      textAlign: 'right'
    }
  }, p.lastAgo))))))), selected && /*#__PURE__*/React.createElement(PipelineDrawer, {
    pipeline: selected,
    onClose: () => setSelected(null),
    onEdit: onOpenCanvas,
    dark: dark
  }));
}

// CanvasScreen — mirrors apps/web/src/pages/PipelineCanvasPage.tsx (Miro-style floating toolbar, category flyouts, AI command bar, output drawer)
const CIcon = (name, size = 16) => /*#__PURE__*/React.createElement("i", {
  "data-lucide": name,
  style: {
    width: size,
    height: size
  }
});
const TOOLBAR_CATS = [{
  id: 'source',
  label: 'Sources',
  icon: 'database',
  color: 'var(--conn-source)'
}, {
  id: 'transform',
  label: 'Transforms',
  icon: 'braces',
  color: 'var(--conn-transform)'
}, {
  id: 'sink',
  label: 'Sinks',
  icon: 'arrow-down-to-line',
  color: 'var(--conn-sink)'
}, {
  id: 'flow',
  label: 'Flow',
  icon: 'git-fork',
  color: 'var(--conn-flow)'
}];
const CATALOG = [{
  catId: 'source',
  label: 'Zendesk',
  icon: 'badge-help',
  color: 'var(--conn-source)'
}, {
  catId: 'source',
  label: 'Google Sheets',
  icon: 'sheet',
  color: 'var(--conn-source)'
}, {
  catId: 'source',
  label: 'Google Drive',
  icon: 'folder',
  color: 'var(--conn-source)'
}, {
  catId: 'source',
  label: 'Excel',
  icon: 'file-spreadsheet',
  color: 'var(--conn-source)'
}, {
  catId: 'source',
  label: 'Postgres',
  icon: 'database',
  color: 'var(--conn-postgres)'
}, {
  catId: 'source',
  label: 'MySQL',
  icon: 'database',
  color: 'var(--conn-mysql)'
}, {
  catId: 'source',
  label: 'MongoDB',
  icon: 'leaf',
  color: 'var(--conn-mongodb)'
}, {
  catId: 'source',
  label: 'Kafka',
  icon: 'workflow',
  color: 'var(--conn-kafka)'
}, {
  catId: 'source',
  label: 'SFTP',
  icon: 'folder-input',
  color: 'var(--conn-sftp)'
}, {
  catId: 'source',
  label: 'HTTP',
  icon: 'globe',
  color: 'var(--conn-source)'
}, {
  catId: 'transform',
  label: 'Filter',
  icon: 'filter',
  color: 'var(--conn-transform)'
}, {
  catId: 'transform',
  label: 'Flatten',
  icon: 'braces',
  color: 'var(--conn-transform)'
}, {
  catId: 'transform',
  label: 'Dedupe',
  icon: 'copy-minus',
  color: 'var(--conn-transform)'
}, {
  catId: 'transform',
  label: 'Data contract',
  icon: 'shield-check',
  color: 'var(--conn-contract)'
}, {
  catId: 'sink',
  label: 'Snowflake',
  icon: 'snowflake',
  color: 'var(--conn-snowflake)'
}, {
  catId: 'sink',
  label: 'Iceberg',
  icon: 'layers',
  color: 'var(--conn-iceberg)'
}, {
  catId: 'sink',
  label: 'ClickHouse',
  icon: 'bar-chart-2',
  color: 'var(--conn-clickhouse)'
}, {
  catId: 'sink',
  label: 'Amazon S3',
  icon: 'archive',
  color: 'var(--conn-s3)'
}, {
  catId: 'sink',
  label: 'Postgres',
  icon: 'database',
  color: 'var(--conn-sink)'
}, {
  catId: 'flow',
  label: 'Fork',
  icon: 'git-fork',
  color: 'var(--conn-flow)'
}, {
  catId: 'flow',
  label: 'Merge',
  icon: 'merge',
  color: 'var(--conn-flow)'
}];
const TRIGGER_TYPES = [{
  value: 'manual',
  label: 'Manual'
}, {
  value: 'cron',
  label: 'Cron'
}, {
  value: 'webhook',
  label: 'Webhook'
}, {
  value: 'event',
  label: 'Upstream pipeline'
}];
function edgePath(from, to) {
  const x1 = from.x + 190,
    y1 = from.y + 30,
    x2 = to.x,
    y2 = to.y + 30;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}
function CanvasConfigPanel({
  node,
  onClose,
  onDelete,
  dark
}) {
  const border = dark ? 'rgba(255,255,255,.1)' : '#e5e7eb';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 300,
      flexShrink: 0,
      borderLeft: `1px solid ${border}`,
      background: dark ? '#0d0f17' : '#fff',
      padding: '76px 18px 18px',
      overflowY: 'auto',
      boxSizing: 'border-box',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 10,
      background: dark ? 'rgba(255,255,255,.05)' : '#f9fafb',
      border: `1px solid ${border}`,
      color: node.color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, CIcon('settings-2', 16)), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, node.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: dark ? 'rgba(255,255,255,.35)' : '#9ca3af'
    }
  }, node.sub)), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      marginLeft: 'auto',
      border: 'none',
      background: 'transparent',
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af',
      cursor: 'pointer',
      flexShrink: 0
    }
  }, CIcon('x', 15))), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      color: dark ? 'rgba(255,255,255,.5)' : '#6b7280',
      display: 'block',
      marginBottom: 6
    }
  }, "Label"), /*#__PURE__*/React.createElement(Input, {
    value: node.label,
    onChange: () => {},
    style: {
      marginBottom: 14
    }
  }), node.sub === 'Source' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      color: dark ? 'rgba(255,255,255,.5)' : '#6b7280',
      display: 'block',
      marginBottom: 6
    }
  }, "Connection"), /*#__PURE__*/React.createElement(Select, {
    options: ['— select connection —', 'ana@dataflow.dev (google)', 'acme.zendesk.com (zendesk)'],
    value: "\u2014 select connection \u2014",
    onChange: () => {},
    style: {
      marginBottom: 14
    }
  }), /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      color: dark ? 'rgba(255,255,255,.5)' : '#6b7280',
      display: 'block',
      marginBottom: 6
    }
  }, "Ingestion mode"), /*#__PURE__*/React.createElement(Select, {
    options: ['Incremental (cursor)', 'Historical backfill → then incremental'],
    value: "Incremental (cursor)",
    onChange: () => {}
  })), node.sub === 'Transform' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      color: dark ? 'rgba(255,255,255,.5)' : '#6b7280',
      display: 'block',
      marginBottom: 6
    }
  }, "Expression"), /*#__PURE__*/React.createElement("textarea", {
    placeholder: "r.amount > 100",
    style: {
      width: '100%',
      minHeight: 64,
      borderRadius: 10,
      border: `1px solid ${border}`,
      background: dark ? 'rgba(255,255,255,.04)' : '#f9fafb',
      color: dark ? '#fff' : '#111827',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      padding: 10,
      boxSizing: 'border-box'
    }
  })), node.sub === 'Sink' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      color: dark ? 'rgba(255,255,255,.5)' : '#6b7280',
      display: 'block',
      marginBottom: 6
    }
  }, "Data layer"), /*#__PURE__*/React.createElement(Select, {
    options: ['bronze', 'silver', 'gold'],
    value: "bronze",
    onChange: () => {}
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => onDelete(node.id),
    style: {
      marginTop: 18,
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: '8px 0',
      borderRadius: 10,
      border: 'none',
      cursor: 'pointer',
      fontSize: 12.5,
      fontWeight: 500,
      fontFamily: 'var(--font-sans)',
      background: 'rgba(248,113,113,.14)',
      color: '#ef4444'
    }
  }, CIcon('trash-2', 13), " Delete node"));
}
function CanvasScreen({
  dark,
  setDark,
  onBack
}) {
  const [nodes, setNodes] = React.useState([]);
  const [edges, setEdges] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [activeCat, setActiveCat] = React.useState(null);
  const [workspacePanel, setWorkspacePanel] = React.useState(null);
  const [catQuery, setCatQuery] = React.useState('');
  const [showAI, setShowAI] = React.useState(false);
  const [aiBuilderOpen, setAiBuilderOpen] = React.useState(false);
  const [aiPrompt, setAiPrompt] = React.useState('');
  const [name, setName] = React.useState('My pipeline');
  const [stage, setStage] = React.useState('draft');
  const [showStageMenu, setShowStageMenu] = React.useState(false);
  const [triggerType, setTriggerType] = React.useState('manual');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [bottomTab, setBottomTab] = React.useState('runs');
  const [zoom, setZoom] = React.useState(100);
  React.useEffect(() => {
    window.lucide?.createIcons();
  });
  const border = dark ? 'rgba(255,255,255,.09)' : '#e5e7eb';
  const isEmpty = nodes.length === 0;
  const rightPanelOpen = !!selected;
  function addNode(entry, sourceId) {
    const id = 'n' + Date.now();
    const source = sourceId ? nodes.find(n => n.id === sourceId) : null;
    const sub = entry.catId === 'source' ? 'Source' : entry.catId === 'sink' ? 'Sink' : entry.catId === 'flow' ? 'Flow' : 'Transform';
    const node = {
      id,
      label: entry.label,
      sub,
      color: entry.color,
      icon: entry.icon,
      status: 'idle',
      x: source ? source.x + 260 : 40 + nodes.length % 5 * 44,
      y: source ? source.y : 60 + nodes.length % 5 * 90
    };
    setNodes(ns => [...ns, node]);
    if (sourceId) setEdges(es => [...es, [sourceId, id]]);
    setSelected(node);
    setActiveCat(null);
    setWorkspacePanel(null);
  }
  function deleteNode(id) {
    setNodes(ns => ns.filter(n => n.id !== id));
    setEdges(es => es.filter(([a, b]) => a !== id && b !== id));
    setSelected(null);
  }
  const catEntries = CATALOG.filter(e => e.catId === activeCat && (!catQuery || e.label.toLowerCase().includes(catQuery.toLowerCase())));
  const leftOffset = workspacePanel ? 210 : activeCat ? 220 : 30;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: '100%',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: dark ? '#0d0f17' : '#f5f5f5',
      backgroundImage: `radial-gradient(circle, ${dark ? 'rgba(255,255,255,0.065)' : 'rgba(0,0,0,0.065)'} 1px, transparent 1px)`,
      backgroundSize: '24px 24px'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none'
    }
  }, edges.map(([a, b], i) => {
    const from = nodes.find(n => n.id === a),
      to = nodes.find(n => n.id === b);
    if (!from || !to) return null;
    return /*#__PURE__*/React.createElement("path", {
      key: i,
      d: edgePath(from, to),
      fill: "none",
      stroke: dark ? 'rgba(154,163,184,.42)' : 'rgba(100,116,139,.35)',
      strokeWidth: "1.6"
    });
  })), nodes.map(n => /*#__PURE__*/React.createElement("div", {
    key: n.id,
    style: {
      position: 'absolute',
      left: n.x,
      top: n.y,
      cursor: 'pointer'
    },
    onClick: () => setSelected(n)
  }, /*#__PURE__*/React.createElement(FlowNode, {
    label: n.label,
    sublabel: n.sub,
    color: n.color,
    icon: CIcon(n.icon, 15),
    status: n.status,
    recordCount: n.count
  }))), isEmpty && !activeCat && !showAI && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%,-50%)',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      fontWeight: 500,
      color: dark ? 'rgba(255,255,255,.3)' : '#9ca3af',
      marginBottom: 16
    }
  }, "Start building your pipeline"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveCat('source'),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 18px',
      borderRadius: 16,
      cursor: 'pointer',
      border: `1px solid ${border}`,
      background: dark ? 'rgba(255,255,255,.05)' : '#fff',
      color: dark ? 'rgba(255,255,255,.7)' : '#4b5563',
      fontSize: 14,
      fontFamily: 'var(--font-sans)',
      boxShadow: dark ? 'none' : '0 2px 8px rgba(0,0,0,.06)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--conn-source)',
      display: 'flex'
    }
  }, CIcon('database', 15)), "Add a source"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowAI(true),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 18px',
      borderRadius: 16,
      cursor: 'pointer',
      border: `1px solid rgba(124,108,242,.3)`,
      background: 'rgba(124,108,242,.1)',
      color: 'var(--brand-500)',
      fontSize: 14,
      fontFamily: 'var(--font-sans)'
    }
  }, CIcon('sparkles', 15), "Generate with AI"))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: drawerOpen ? 232 : 12,
      left: 64,
      display: 'flex',
      alignItems: 'flex-end',
      gap: 10,
      transition: 'bottom .15s ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      borderRadius: 10,
      overflow: 'hidden',
      border: `1px solid ${border}`,
      background: dark ? 'rgba(20,22,31,.92)' : '#fff',
      boxShadow: dark ? '0 8px 24px rgba(0,0,0,.3)' : '0 4px 14px rgba(0,0,0,.08)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setZoom(z => Math.min(200, z + 10)),
    style: {
      width: 30,
      height: 30,
      border: 'none',
      borderRight: `1px solid ${border}`,
      background: 'transparent',
      color: dark ? 'rgba(255,255,255,.7)' : '#374151',
      cursor: 'pointer'
    }
  }, CIcon('plus', 13)), /*#__PURE__*/React.createElement("button", {
    onClick: () => setZoom(z => Math.max(25, z - 10)),
    style: {
      width: 30,
      height: 30,
      border: 'none',
      borderRight: `1px solid ${border}`,
      background: 'transparent',
      color: dark ? 'rgba(255,255,255,.7)' : '#374151',
      cursor: 'pointer'
    }
  }, CIcon('minus', 13)), /*#__PURE__*/React.createElement("button", {
    onClick: () => setZoom(100),
    style: {
      width: 30,
      height: 30,
      border: 'none',
      borderRight: `1px solid ${border}`,
      background: 'transparent',
      color: dark ? 'rgba(255,255,255,.7)' : '#374151',
      cursor: 'pointer'
    }
  }, CIcon('maximize', 13)), /*#__PURE__*/React.createElement("button", {
    style: {
      width: 30,
      height: 30,
      border: 'none',
      background: 'transparent',
      color: dark ? 'rgba(255,255,255,.7)' : '#374151',
      cursor: 'pointer'
    }
  }, CIcon('lock', 13))), !isEmpty && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 130,
      height: 82,
      borderRadius: 10,
      background: dark ? 'rgba(255,255,255,.06)' : '#fff',
      border: `1px solid ${border}`,
      boxShadow: dark ? '0 8px 24px rgba(0,0,0,.3)' : '0 4px 14px rgba(0,0,0,.08)',
      position: 'relative',
      overflow: 'hidden'
    }
  }, nodes.map(n => /*#__PURE__*/React.createElement("div", {
    key: n.id,
    style: {
      position: 'absolute',
      left: n.x / 6,
      top: n.y / 6,
      width: 22,
      height: 11,
      borderRadius: 2,
      background: n.color
    }
  })))), drawerOpen ? /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 12,
      left: 64,
      right: 12,
      height: 210,
      borderRadius: 16,
      border: `1px solid ${border}`,
      background: dark ? 'rgba(13,16,24,.96)' : 'rgba(255,255,255,.97)',
      boxShadow: dark ? '0 -8px 32px rgba(0,0,0,.4)' : '0 -4px 24px rgba(0,0,0,.08)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      height: 40,
      flexShrink: 0,
      borderBottom: `1px solid ${border}`,
      padding: '0 10px'
    }
  }, [['runs', 'history', 'Runs'], ['logs', 'terminal', 'Logs'], ['lifecycle', 'activity', 'Lifecycle']].map(([id, icon, label]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    onClick: () => setBottomTab(id),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      height: 30,
      padding: '0 10px',
      borderRadius: 8,
      border: 'none',
      cursor: 'pointer',
      fontSize: 11,
      fontWeight: 500,
      fontFamily: 'var(--font-sans)',
      background: bottomTab === id ? dark ? 'rgba(255,255,255,.08)' : '#f3f4f6' : 'transparent',
      color: bottomTab === id ? dark ? 'rgba(255,255,255,.85)' : '#1f2937' : dark ? 'rgba(255,255,255,.35)' : '#9ca3af'
    }
  }, CIcon(icon, 12), label)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setDrawerOpen(false),
    style: {
      width: 26,
      height: 26,
      borderRadius: 7,
      border: 'none',
      background: 'transparent',
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af',
      cursor: 'pointer'
    }
  }, CIcon('chevron-down', 14))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: bottomTab === 'lifecycle' ? 14 : 0
    }
  }, bottomTab === 'runs' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: dark ? 'rgba(255,255,255,.35)' : '#9ca3af'
    }
  }, "No runs yet."), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "primary",
    icon: CIcon('play', 12)
  }, "Run pipeline")), bottomTab === 'logs' && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 14,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af'
    }
  }, "Select a run to inspect execution output."), bottomTab === 'lifecycle' && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 10,
      height: '100%'
    }
  }, ['draft', 'testing', 'production'].map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s,
    style: {
      borderRadius: 12,
      border: `1px solid ${s === stage ? 'rgba(124,108,242,.4)' : border}`,
      background: s === stage ? 'rgba(124,108,242,.06)' : 'transparent',
      padding: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 20,
      height: 20,
      borderRadius: '50%',
      fontSize: 10,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: s === stage ? 'var(--brand-500)' : dark ? 'rgba(255,255,255,.06)' : '#f3f4f6',
      color: s === stage ? '#fff' : dark ? 'rgba(255,255,255,.3)' : '#9ca3af'
    }
  }, i + 1), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'capitalize'
    }
  }, s === 'testing' ? 'Integration' : s)), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 10,
      color: dark ? 'rgba(255,255,255,.3)' : '#9ca3af',
      marginTop: 6
    }
  }, s === stage ? 'Current pipeline stage' : s === 'production' ? 'Promote after green Integration run' : 'Saved pipeline version')))))) : /*#__PURE__*/React.createElement("button", {
    onClick: () => setDrawerOpen(true),
    style: {
      position: 'absolute',
      bottom: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '7px 13px',
      borderRadius: 10,
      cursor: 'pointer',
      border: `1px solid ${border}`,
      background: dark ? 'rgba(17,20,29,.92)' : 'rgba(255,255,255,.95)',
      color: dark ? 'rgba(255,255,255,.5)' : '#6b7280',
      fontSize: 11,
      fontFamily: 'var(--font-sans)',
      boxShadow: dark ? '0 8px 24px rgba(0,0,0,.3)' : '0 2px 10px rgba(0,0,0,.06)'
    }
  }, CIcon('chevron-up', 13), " Output")), /*#__PURE__*/React.createElement("aside", {
    style: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 52,
      zIndex: 20,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      borderRight: `1px solid ${dark ? 'rgba(255,255,255,.08)' : '#e5e7eb'}`,
      background: dark ? 'rgba(13,15,23,.95)' : 'rgba(255,255,255,.95)',
      padding: '12px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onBack,
    title: "DataFlow \u2014 Home",
    style: {
      width: 36,
      height: 36,
      borderRadius: 10,
      marginBottom: 6,
      cursor: 'pointer',
      background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 14px rgba(124,108,242,.3)',
      color: '#fff',
      fontSize: 13,
      fontWeight: 700,
      letterSpacing: '-0.02em',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement(AtomMark, {
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 1,
      background: border,
      margin: '4px 0'
    }
  }), TOOLBAR_CATS.map(cat => /*#__PURE__*/React.createElement("button", {
    key: cat.id,
    title: cat.label,
    onClick: () => {
      setActiveCat(activeCat === cat.id ? null : cat.id);
      setWorkspacePanel(null);
      setCatQuery('');
    },
    style: {
      width: 36,
      height: 36,
      borderRadius: 10,
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: activeCat === cat.id ? cat.color : 'transparent',
      color: activeCat === cat.id ? '#fff' : dark ? 'rgba(255,255,255,.4)' : '#9ca3af'
    }
  }, CIcon(cat.icon, 17))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 1,
      background: border,
      margin: '4px 0'
    }
  }), /*#__PURE__*/React.createElement(IconButton, {
    title: "Quick AI add",
    active: showAI,
    onClick: () => {
      setShowAI(v => !v);
      setActiveCat(null);
      setWorkspacePanel(null);
    }
  }, CIcon('sparkles', 17)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 1,
      background: border,
      margin: '4px 0'
    }
  }), /*#__PURE__*/React.createElement(IconButton, {
    title: "Connectors",
    active: workspacePanel === 'connectors',
    onClick: () => {
      setWorkspacePanel(workspacePanel === 'connectors' ? null : 'connectors');
      setActiveCat(null);
    }
  }, CIcon('cable', 17)), /*#__PURE__*/React.createElement(IconButton, {
    title: "Pipeline runs",
    active: drawerOpen && bottomTab === 'runs',
    onClick: () => {
      setActiveCat(null);
      setWorkspacePanel(null);
      drawerOpen && bottomTab === 'runs' ? setDrawerOpen(false) : (setBottomTab('runs'), setDrawerOpen(true));
    }
  }, CIcon('history', 17)), /*#__PURE__*/React.createElement(IconButton, {
    title: "Pipeline lifecycle",
    active: drawerOpen && bottomTab === 'lifecycle',
    onClick: () => {
      setActiveCat(null);
      setWorkspacePanel(null);
      drawerOpen && bottomTab === 'lifecycle' ? setDrawerOpen(false) : (setBottomTab('lifecycle'), setDrawerOpen(true));
    }
  }, CIcon('rocket', 17)), /*#__PURE__*/React.createElement(IconButton, {
    title: dark ? 'Light mode' : 'Dark mode',
    onClick: () => setDark(!dark)
  }, CIcon(dark ? 'sun' : 'moon', 16))), activeCat && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 60,
      top: 12,
      bottom: 12,
      width: 300,
      zIndex: 15,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      borderRadius: 16,
      border: `1px solid ${border}`,
      background: dark ? 'rgba(13,16,23,.97)' : 'rgba(255,255,255,.98)',
      backdropFilter: 'blur(16px)',
      boxShadow: dark ? '0 12px 32px rgba(0,0,0,.35)' : '0 8px 28px rgba(0,0,0,.1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 12,
      borderBottom: `1px solid ${border}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      marginBottom: 8
    }
  }, TOOLBAR_CATS.find(c => c.id === activeCat)?.label), /*#__PURE__*/React.createElement(Input, {
    icon: CIcon('search', 12),
    placeholder: "Search\u2026",
    value: catQuery,
    onChange: e => setCatQuery(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 8,
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 4,
      alignContent: 'start'
    }
  }, catEntries.map(entry => /*#__PURE__*/React.createElement("button", {
    key: entry.label,
    onClick: () => addNode(entry, selected?.id),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      border: 'none',
      background: 'transparent',
      borderRadius: 10,
      padding: '8px',
      cursor: 'pointer',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 26,
      height: 26,
      borderRadius: 8,
      background: dark ? 'rgba(255,255,255,.05)' : '#f9fafb',
      border: `1px solid ${border}`,
      color: entry.color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, CIcon(entry.icon, 13)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      fontWeight: 500,
      color: dark ? 'rgba(255,255,255,.7)' : '#4b5563',
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, entry.label))), !catEntries.length && /*#__PURE__*/React.createElement("p", {
    style: {
      gridColumn: '1 / -1',
      fontSize: 11,
      color: dark ? 'rgba(255,255,255,.3)' : '#9ca3af',
      textAlign: 'center',
      padding: '16px 0'
    }
  }, "No matches"))), workspacePanel === 'connectors' && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 60,
      top: 12,
      bottom: 12,
      width: 280,
      zIndex: 15,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      borderRadius: 16,
      border: `1px solid ${border}`,
      background: dark ? 'rgba(13,16,23,.97)' : 'rgba(255,255,255,.98)',
      backdropFilter: 'blur(16px)',
      boxShadow: dark ? '0 12px 32px rgba(0,0,0,.35)' : '0 8px 28px rgba(0,0,0,.1)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '12px 14px',
      borderBottom: `1px solid ${border}`
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600
    }
  }, "Connectors"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: dark ? 'rgba(255,255,255,.35)' : '#9ca3af'
    }
  }, "Add and configure integrations")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setWorkspacePanel(null),
    style: {
      marginLeft: 'auto',
      border: 'none',
      background: 'transparent',
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af',
      cursor: 'pointer'
    }
  }, CIcon('x', 14))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 10,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, CATALOG.filter(e => e.catId === 'source' || e.catId === 'sink').map(entry => /*#__PURE__*/React.createElement("div", {
    key: entry.catId + entry.label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      borderRadius: 12,
      border: `1px solid ${border}`,
      padding: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 9,
      background: entry.color,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, CIcon(entry.icon, 14)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      fontWeight: 600,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, entry.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 600,
      textTransform: 'uppercase',
      color: dark ? 'rgba(255,255,255,.3)' : '#9ca3af'
    }
  }, entry.catId)), /*#__PURE__*/React.createElement("button", {
    onClick: () => addNode(entry),
    style: {
      width: 26,
      height: 26,
      borderRadius: 7,
      border: `1px solid ${border}`,
      background: 'transparent',
      color: dark ? 'rgba(255,255,255,.6)' : '#6b7280',
      cursor: 'pointer',
      flexShrink: 0
    }
  }, CIcon('plus', 13)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 16,
      left: 60 + leftOffset,
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      transition: 'left .15s ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      borderRadius: 16,
      border: `1px solid ${border}`,
      background: dark ? 'rgba(13,16,24,.9)' : 'rgba(255,255,255,.95)',
      backdropFilter: 'blur(16px)',
      padding: '9px 12px',
      boxShadow: dark ? '0 8px 24px rgba(0,0,0,.3)' : '0 2px 12px rgba(0,0,0,.06)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: name,
    onChange: e => setName(e.target.value),
    "aria-label": "Pipeline name",
    style: {
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontSize: 13,
      fontWeight: 600,
      width: 150,
      color: dark ? 'rgba(255,255,255,.9)' : '#111827',
      fontFamily: 'var(--font-sans)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 16,
      background: border
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowStageMenu(v => !v),
    style: {
      border: 'none',
      cursor: 'pointer',
      background: 'none',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement(StageBadge, {
    stage: stage
  })), showStageMenu && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 26,
      left: 0,
      width: 190,
      borderRadius: 12,
      border: `1px solid ${border}`,
      background: dark ? '#12141d' : '#fff',
      boxShadow: dark ? '0 12px 32px rgba(0,0,0,.4)' : '0 8px 24px rgba(0,0,0,.12)',
      padding: 8,
      zIndex: 30
    }
  }, stage === 'draft' && /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    icon: CIcon('rocket', 13),
    onClick: () => {
      setStage('testing');
      setShowStageMenu(false);
    },
    style: {
      width: '100%',
      justifyContent: 'flex-start'
    }
  }, "Activate \u2192 Integration"), stage === 'testing' && /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "primary",
    icon: CIcon('layers', 13),
    onClick: () => {
      setStage('production');
      setShowStageMenu(false);
    },
    style: {
      width: '100%',
      justifyContent: 'flex-start'
    }
  }, "Promote to Production"), stage === 'production' && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: '#10b981',
      padding: '4px 6px',
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, CIcon('activity', 13), " Live in production"))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 16,
      background: border
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5
    }
  }, CIcon('clock', 12), /*#__PURE__*/React.createElement("select", {
    value: triggerType,
    onChange: e => setTriggerType(e.target.value),
    "aria-label": "Trigger type",
    style: {
      background: 'transparent',
      border: 'none',
      outline: 'none',
      fontSize: 11.5,
      color: dark ? 'rgba(255,255,255,.6)' : '#6b7280',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)'
    }
  }, TRIGGER_TYPES.map(t => /*#__PURE__*/React.createElement("option", {
    key: t.value,
    value: t.value
  }, t.label)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 16,
      right: aiBuilderOpen ? 356 : 16,
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      transition: 'right .15s ease'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      borderRadius: 16,
      border: `1px solid ${border}`,
      background: dark ? 'rgba(13,16,24,.9)' : 'rgba(255,255,255,.95)',
      backdropFilter: 'blur(16px)',
      padding: 6,
      boxShadow: dark ? '0 8px 24px rgba(0,0,0,.3)' : '0 2px 12px rgba(0,0,0,.06)'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    icon: CIcon('save', 13)
  }, "Save"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost"
  }, "Activate"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "primary",
    icon: CIcon('play', 12)
  }, "Run"))), showAI && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 76,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 460,
      maxWidth: 'calc(100% - 40px)',
      zIndex: 25
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: 8,
      borderRadius: 16,
      border: `1px solid ${border}`,
      background: dark ? 'rgba(17,20,29,.96)' : '#fff',
      boxShadow: dark ? '0 14px 36px rgba(0,0,0,.4)' : '0 8px 28px rgba(0,0,0,.12)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      color: 'var(--brand-500)'
    }
  }, CIcon('sparkles', 16)), /*#__PURE__*/React.createElement("input", {
    value: aiPrompt,
    onChange: e => setAiPrompt(e.target.value),
    placeholder: isEmpty ? 'Describe the pipeline you want to build…' : 'Ask AI to edit this pipeline…',
    style: {
      flex: 1,
      minWidth: 0,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontSize: 13,
      color: dark ? '#fff' : '#111827',
      fontFamily: 'var(--font-sans)'
    }
  }), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "primary",
    onClick: () => {
      if (!aiPrompt.trim()) return;
      const src = {
        id: 'n' + Date.now(),
        label: 'Zendesk tickets',
        sub: 'Source',
        color: 'var(--conn-source)',
        icon: 'badge-help',
        status: 'idle',
        x: 40,
        y: 80
      };
      const tr = {
        id: 'n' + (Date.now() + 1),
        label: 'Filter',
        sub: 'Transform',
        color: 'var(--conn-transform)',
        icon: 'filter',
        status: 'idle',
        x: 320,
        y: 80
      };
      const sink = {
        id: 'n' + (Date.now() + 2),
        label: 'Snowflake',
        sub: 'Sink',
        color: 'var(--conn-snowflake)',
        icon: 'snowflake',
        status: 'idle',
        x: 600,
        y: 80
      };
      setNodes(ns => [...ns, src, tr, sink]);
      setEdges(es => [...es, [src.id, tr.id], [tr.id, sink.id]]);
      setSelected(src);
      setShowAI(false);
      setAiPrompt('');
    }
  }, "Generate"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowAI(false),
    style: {
      border: 'none',
      background: 'transparent',
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af',
      cursor: 'pointer'
    }
  }, CIcon('x', 14))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setShowAI(false);
      setAiBuilderOpen(true);
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      border: 'none',
      cursor: 'pointer',
      padding: '5px 10px',
      borderRadius: 8,
      background: dark ? 'rgba(17,20,29,.9)' : 'rgba(255,255,255,.95)',
      color: 'var(--brand-500)',
      fontSize: 11.5,
      fontWeight: 500,
      fontFamily: 'var(--font-sans)',
      border: `1px solid ${border}`,
      boxShadow: dark ? '0 6px 18px rgba(0,0,0,.3)' : '0 2px 10px rgba(0,0,0,.06)'
    }
  }, CIcon('panel-right-open', 12), " Open AI Builder"))), aiBuilderOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: 340,
      zIndex: 26,
      display: 'flex',
      flexDirection: 'column',
      borderLeft: `1px solid ${border}`,
      background: dark ? '#0d0f17' : '#fff',
      boxShadow: dark ? '-18px 0 50px rgba(0,0,0,.35)' : '-18px 0 50px rgba(0,0,0,.08)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '14px 16px',
      borderBottom: `1px solid ${border}`,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      color: 'var(--brand-500)'
    }
  }, CIcon('sparkles', 15)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, "AI Builder"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setAiBuilderOpen(false),
    style: {
      marginLeft: 'auto',
      border: 'none',
      background: 'transparent',
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af',
      cursor: 'pointer',
      display: 'flex'
    }
  }, CIcon('x', 14))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      alignSelf: 'flex-end',
      maxWidth: '85%',
      padding: '8px 12px',
      borderRadius: '14px 14px 4px 14px',
      background: 'var(--brand-500)',
      color: '#fff',
      fontSize: 12.5,
      lineHeight: 1.45
    }
  }, "Sync Zendesk tickets to Snowflake, only open ones"), /*#__PURE__*/React.createElement("div", {
    style: {
      alignSelf: 'flex-start',
      maxWidth: '90%',
      padding: '10px 12px',
      borderRadius: '14px 14px 14px 4px',
      background: dark ? 'rgba(255,255,255,.05)' : '#f9fafb',
      border: `1px solid ${border}`,
      fontSize: 12.5,
      lineHeight: 1.5,
      color: dark ? 'rgba(255,255,255,.8)' : '#374151'
    }
  }, "I built a 3-step pipeline: ", /*#__PURE__*/React.createElement("strong", null, "Zendesk tickets"), " \u2192 ", /*#__PURE__*/React.createElement("strong", null, "Filter"), " (", /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 11
    }
  }, "status = \"open\""), ") \u2192 ", /*#__PURE__*/React.createElement("strong", null, "Snowflake"), ". Click any node to adjust its config, or ask me to change it."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 2
    }
  }, ['Add a dedupe step', 'Route failures to S3', 'Run hourly'].map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    onClick: () => setAiPrompt(s),
    style: {
      border: `1px solid ${border}`,
      background: 'transparent',
      borderRadius: 999,
      padding: '4px 10px',
      fontSize: 11,
      color: dark ? 'rgba(255,255,255,.55)' : '#6b7280',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)'
    }
  }, s)))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 12,
      borderTop: `1px solid ${border}`,
      flexShrink: 0,
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: aiPrompt,
    onChange: e => setAiPrompt(e.target.value),
    placeholder: "Ask AI to edit this pipeline\u2026",
    style: {
      flex: 1,
      minWidth: 0,
      border: `1px solid ${border}`,
      outline: 'none',
      borderRadius: 10,
      padding: '8px 10px',
      background: dark ? 'rgba(255,255,255,.04)' : '#f9fafb',
      fontSize: 12.5,
      color: dark ? '#fff' : '#111827',
      fontFamily: 'var(--font-sans)'
    }
  }), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "primary",
    onClick: () => setAiPrompt('')
  }, "Send"))), rightPanelOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0
    }
  }, /*#__PURE__*/React.createElement(CanvasConfigPanel, {
    node: selected,
    onClose: () => setSelected(null),
    onDelete: deleteNode,
    dark: dark
  })));
}

// ConnectorsScreen — mirrors apps/web/src/pages/ConnectorsPage.tsx
const XIcon = (name, size = 18) => /*#__PURE__*/React.createElement("i", {
  "data-lucide": name,
  style: {
    width: size,
    height: size
  }
});
const PROVIDERS = [{
  key: 'google',
  label: 'Google',
  from: '#10b981',
  to: '#16a34a',
  icon: 'sheet',
  sub: 'OAuth 2.0',
  connected: [{
    name: 'ana@dataflow.dev',
    ago: '2d ago'
  }]
}, {
  key: 'microsoft',
  label: 'Microsoft',
  from: '#3b82f6',
  to: '#06b6d4',
  icon: 'blocks',
  sub: 'OAuth 2.0',
  connected: []
}, {
  key: 'zendesk',
  label: 'Zendesk',
  from: '#334155',
  to: '#047857',
  icon: 'badge-help',
  sub: 'Per-subdomain OAuth',
  connected: [{
    name: 'acme',
    ago: '5h ago',
    subdomain: true
  }]
}];
const CREDENTIALS = [{
  name: 'warehouse',
  provider: 'postgres'
}, {
  name: 'events-cluster',
  provider: 'kafka'
}];
function ConnectorsScreen({
  dark
}) {
  const [zendeskOpen, setZendeskOpen] = React.useState(false);
  React.useEffect(() => {
    window.lucide?.createIcons();
  });
  const border = dark ? 'rgba(255,255,255,.09)' : '#e5e7eb';
  const cardBg = dark ? 'rgba(255,255,255,.045)' : '#fff';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 780,
      margin: '0 auto',
      padding: '36px 24px 60px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: '-0.04em',
      margin: 0
    }
  }, "Connect accounts"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: dark ? 'rgba(255,255,255,.4)' : '#6b7280',
      marginTop: 4
    }
  }, "OAuth integrations \u2014 tokens are stored encrypted per-tenant.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 14
    }
  }, PROVIDERS.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.key,
    style: {
      background: cardBg,
      border: `1px solid ${border}`,
      borderRadius: 14,
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(ConnectorAvatar, {
    from: p.from,
    to: p.to,
    icon: XIcon(p.icon)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 15
    }
  }, p.label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af',
      marginTop: 2
    }
  }, p.sub)), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '4px 9px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 500,
      background: p.connected.length ? '#ecfdf5' : dark ? 'rgba(255,255,255,.06)' : '#f3f4f6',
      color: p.connected.length ? '#047857' : dark ? 'rgba(255,255,255,.5)' : '#6b7280',
      border: `1px solid ${p.connected.length ? '#a7f3d0' : border}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: p.connected.length ? '#34d399' : '#d1d5db'
    }
  }), p.connected.length ? 'Active' : 'Not connected')), p.connected.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: `1px solid ${dark ? 'rgba(255,255,255,.06)' : '#f3f4f6'}`
    }
  }, p.connected.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '9px 0',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", null, c.name, c.subdomain && /*#__PURE__*/React.createElement("span", {
    style: {
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af'
    }
  }, ".zendesk.com")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af'
    }
  }, "Connected ", c.ago)), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "danger"
  }, "Disconnect")))), !p.connected.length && /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: () => p.key === 'zendesk' && setZendeskOpen(true)
  }, "Connect ", p.label, " \u2192"), p.key === 'zendesk' && p.connected.length > 0 && /*#__PURE__*/React.createElement("button", {
    onClick: () => setZendeskOpen(true),
    style: {
      alignSelf: 'flex-start',
      border: 'none',
      background: 'none',
      color: 'var(--brand-500)',
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer'
    }
  }, "+ Connect another subdomain")))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: cardBg,
      border: `1px solid ${border}`,
      borderRadius: 14,
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12
    }
  }, XIcon('plug', 16), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 15
    }
  }, "Credentials"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    style: {
      marginLeft: 'auto'
    }
  }, "+ Add credential")), CREDENTIALS.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '8px 0',
      fontSize: 13,
      borderTop: i > 0 ? `1px solid ${dark ? 'rgba(255,255,255,.05)' : '#f3f4f6'}` : 'none'
    }
  }, /*#__PURE__*/React.createElement("span", null, c.name, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: dark ? 'rgba(255,255,255,.4)' : '#9ca3af'
    }
  }, "\xB7 ", c.provider)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost"
  }, "Test"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "danger"
  }, "\u2715"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      padding: 16,
      borderRadius: 14,
      background: dark ? 'rgba(255,255,255,.03)' : '#fff',
      border: `1px solid ${border}`,
      fontSize: 12,
      color: dark ? 'rgba(255,255,255,.5)' : '#6b7280'
    }
  }, XIcon('shield-check', 18), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: dark ? 'rgba(255,255,255,.7)' : '#374151'
    }
  }, "Security note:"), " OAuth tokens are AES-256 encrypted and stored per-tenant. Revoking a connection immediately invalidates the stored token.")), zendeskOpen && /*#__PURE__*/React.createElement(Modal, {
    title: "Connect Zendesk subdomain",
    onClose: () => setZendeskOpen(false),
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      onClick: () => setZendeskOpen(false)
    }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary"
    }, "Connect \u2192"))
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: 12,
      color: '#6b7280',
      display: 'block',
      marginBottom: 6
    }
  }, "Subdomain"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "acme"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: '#9ca3af',
      whiteSpace: 'nowrap'
    }
  }, ".zendesk.com"))));
}
function App() {
  const [route, setRoute] = React.useState('pipelines');
  const [dark, setDark] = React.useState(false);
  if (route === 'canvas') {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        height: '100vh',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement(CanvasScreen, {
      dark: dark,
      setDark: setDark,
      onBack: () => setRoute('pipelines')
    }));
  }
  return /*#__PURE__*/React.createElement(AppShellChrome, {
    route: route,
    setRoute: setRoute,
    dark: dark,
    setDark: setDark
  }, route === 'pipelines' && /*#__PURE__*/React.createElement(PipelinesScreen, {
    dark: dark,
    onOpenCanvas: () => setRoute('canvas')
  }), route === 'connectors' && /*#__PURE__*/React.createElement(ConnectorsScreen, {
    dark: dark
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/pipeline-builder/app.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.SidebarNavItem = __ds_scope.SidebarNavItem;

__ds_ns.ConnectorAvatar = __ds_scope.ConnectorAvatar;

__ds_ns.FilterPill = __ds_scope.FilterPill;

__ds_ns.FlowNode = __ds_scope.FlowNode;

__ds_ns.StageBadge = __ds_scope.StageBadge;

__ds_ns.StatTile = __ds_scope.StatTile;

})();
