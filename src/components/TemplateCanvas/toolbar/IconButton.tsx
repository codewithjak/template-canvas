/**
 * IconButton.tsx
 *
 * The small building blocks every toolbar button is made of:
 *   - Tooltip : shows a label (and optional shortcut) on hover
 *   - IconBtn : a single icon button, wrapped in a Tooltip
 *   - Divider : a thin line that separates groups of buttons
 */

import type { ReactNode } from 'react';

interface TooltipProps {
  label: string;
  shortcut?: string;
  children: ReactNode;
}

export function Tooltip({ label, shortcut, children }: TooltipProps) {
  return (
    <div className="tb-tooltip-wrap">
      {children}
      <div className="tb-tooltip" role="tooltip">
        <span className="tb-tooltip__label">{label}</span>
        {shortcut && <kbd className="tb-tooltip__key">{shortcut}</kbd>}
      </div>
    </div>
  );
}

interface IconBtnProps {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'action' | 'page' | 'danger' | 'primary';
  active?: boolean;
}

export function IconBtn({ icon, label, shortcut, onClick, disabled, variant = 'default', active }: IconBtnProps) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        className={[
          'tb-btn',
          `tb-btn--${variant}`,
          active ? 'tb-btn--active' : '',
          disabled ? 'tb-btn--disabled' : '',
        ].filter(Boolean).join(' ')}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

export const Divider = () => <div className="tb-divider" aria-hidden="true" />;
