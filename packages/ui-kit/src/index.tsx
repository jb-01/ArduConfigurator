import type { CSSProperties, PropsWithChildren, ReactNode } from 'react'

const palette = {
  surface: 'var(--bg-panel, #141414)',
  surfaceRaised: 'var(--bg-panel-raised, #1f1f1f)',
  surfaceInset: 'var(--bg-panel-soft, #242424)',
  border: 'var(--border, #3d3d3d)',
  borderStrong: 'var(--border-strong, #595959)',
  text: 'var(--text, #f2f2f2)',
  muted: 'var(--text-muted, #b3b3b3)',
  dim: 'var(--text-dim, #999999)',
  accent: 'var(--accent, #ffbb00)',
  primary: 'var(--primary-action, #96e212)',
  success: 'var(--success, #96e212)',
  warning: 'var(--warning, #ff6600)',
  danger: 'var(--danger, #e2123f)'
}

export function Panel({
  title,
  subtitle,
  actions,
  children
}: PropsWithChildren<{ title: string; subtitle?: string; actions?: ReactNode }>) {
  return (
    <section
      style={{
        background: 'transparent',
        border: 'none',
        borderRadius: 0,
        padding: 0
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              color: palette.text,
              fontSize: 24,
              lineHeight: 1.05,
              letterSpacing: 0,
              fontWeight: 300,
              paddingBottom: 6,
              borderBottom: `2px solid ${palette.accent}`,
              display: 'inline-block'
            }}
          >
            {title}
          </h2>
          {subtitle ? <p style={{ margin: '8px 0 0', color: palette.dim, lineHeight: 1.5, fontSize: 12 }}>{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      <div>{children}</div>
    </section>
  )
}

export function StatusBadge({ tone, children }: PropsWithChildren<{ tone: 'neutral' | 'success' | 'warning' | 'danger' }>) {
  const color =
    tone === 'success' ? palette.success : tone === 'warning' ? palette.warning : tone === 'danger' ? palette.danger : palette.accent

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px',
        borderRadius: 3,
        border: `1px solid ${color}48`,
        color: tone === 'neutral' ? palette.text : color,
        background: tone === 'neutral' ? 'rgba(255, 187, 0, 0.12)' : `${color}14`,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.04,
        fontFamily: '"IBM Plex Mono", "SFMono-Regular", "SF Mono", Consolas, monospace',
        lineHeight: 1.4
      }}
    >
      {children}
    </span>
  )
}

export function KeyValueRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        padding: '7px 0',
        borderBottom: `1px solid ${palette.border}`
      }}
    >
      <span style={{ color: palette.dim, fontSize: 12 }}>{label}</span>
      <strong style={{ color: palette.text, fontSize: 12 }}>{value}</strong>
    </div>
  )
}

export function buttonStyle(kind: 'primary' | 'secondary' | 'hero' = 'secondary'): CSSProperties {
  if (kind === 'hero') {
    return {
      border: '1px solid var(--primary-600, #e8a803)',
      background: 'var(--primary-500, #ffbb00)',
      color: '#111111',
      padding: '8px 14px',
      borderRadius: 3,
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: 0.01,
      cursor: 'pointer'
    }
  }
  return {
    border: `1px solid ${kind === 'primary' ? 'var(--primary-action-border, #79b210)' : 'var(--surface-400, #333333)'}`,
    background: kind === 'primary' ? 'var(--primary-action, #96e212)' : 'var(--surface-500, #3d3d3d)',
    color: kind === 'primary' ? '#111111' : 'var(--surface-950, #cccccc)',
    padding: '5px 10px',
    borderRadius: 3,
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 0.01,
    cursor: 'pointer'
  }
}
