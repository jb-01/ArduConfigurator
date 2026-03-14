import type { CSSProperties, PropsWithChildren, ReactNode } from 'react'

const palette = {
  surface: '#0f172a',
  surfaceRaised: '#172033',
  border: '#243049',
  text: '#e6edf7',
  muted: '#96a4bd',
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
        background: palette.surfaceRaised,
        border: `1px solid ${palette.border}`,
        borderRadius: 18,
        padding: 20,
        boxShadow: '0 18px 48px rgba(0, 0, 0, 0.22)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: palette.text, fontSize: 20 }}>{title}</h2>
          {subtitle ? <p style={{ margin: '8px 0 0', color: palette.muted }}>{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      <div style={{ marginTop: 18 }}>{children}</div>
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
        background: `${color}14`,
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
        padding: '10px 0',
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
    background: kind === 'primary' ? '#102d3b' : palette.surface,
    color: palette.text,
    padding: '10px 14px',
    borderRadius: 12,
    fontWeight: 700,
    cursor: 'pointer'
  }
}

