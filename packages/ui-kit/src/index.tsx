import type { CSSProperties, PropsWithChildren, ReactNode } from 'react'

const palette = {
  surface: '#0b1320',
  surfaceRaised: '#111c2d',
  border: '#27354d',
  text: '#e6edf7',
  muted: '#8fa0bc',
  accent: '#61dafb',
  success: '#2cb67d',
  warning: '#f4b942',
  danger: '#ff6b6b'
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
        background: 'linear-gradient(180deg, rgba(16, 24, 37, 0.96), rgba(11, 18, 29, 0.98))',
        border: `1px solid ${palette.border}`,
        borderRadius: 18,
        padding: 18
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: palette.text, fontSize: 17, letterSpacing: '-0.02em' }}>{title}</h2>
          {subtitle ? <p style={{ margin: '6px 0 0', color: palette.muted, lineHeight: 1.5, fontSize: 14 }}>{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      <div style={{ marginTop: 16 }}>{children}</div>
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
        gap: 8,
        padding: '6px 10px',
        borderRadius: 999,
        border: `1px solid ${color}55`,
        color,
        background: `${color}12`,
        fontSize: 12,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.08
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
        gap: 12,
        padding: '11px 0',
        borderBottom: `1px solid ${palette.border}`
      }}
    >
      <span style={{ color: palette.muted }}>{label}</span>
      <strong style={{ color: palette.text }}>{value}</strong>
    </div>
  )
}

export function buttonStyle(kind: 'primary' | 'secondary' = 'secondary'): CSSProperties {
  return {
    border: `1px solid ${kind === 'primary' ? palette.accent : palette.border}`,
    background: kind === 'primary' ? 'linear-gradient(180deg, #153548, #102634)' : palette.surface,
    color: palette.text,
    padding: '9px 13px',
    borderRadius: 12,
    fontWeight: 700,
    boxShadow: kind === 'primary' ? '0 8px 20px rgba(8, 20, 32, 0.24)' : 'none',
    cursor: 'pointer'
  }
}
