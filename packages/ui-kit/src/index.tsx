import type { CSSProperties, PropsWithChildren, ReactNode } from 'react'

const palette = {
  surface: '#090d12',
  surfaceRaised: '#151c25',
  surfaceInset: '#0b1016',
  border: '#2e3d4e',
  borderStrong: '#42566b',
  text: '#e4eaf0',
  muted: '#8ea0b0',
  dim: '#5a7088',
  accent: '#6db8e0',
  primary: '#dab254',
  success: '#5cc28a',
  warning: '#dab254',
  danger: '#d46b62'
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
        borderRadius: 7,
        padding: 12
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, color: palette.text, fontSize: 14, letterSpacing: '-0.01em', fontWeight: 600 }}>{title}</h2>
          {subtitle ? <p style={{ margin: '3px 0 0', color: palette.dim, lineHeight: 1.4, fontSize: 12 }}>{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
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
        padding: '2px 6px',
        borderRadius: 3,
        border: `1px solid ${color}48`,
        color,
        background: `${color}14`,
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
      border: '1px solid rgba(218, 178, 84, 0.6)',
      background: 'linear-gradient(180deg, rgba(218, 178, 84, 0.18), rgba(218, 178, 84, 0.10))',
      color: '#f0d56e',
      padding: '12px 20px',
      borderRadius: 6,
      fontWeight: 700,
      fontSize: 14,
      letterSpacing: 0.01,
      cursor: 'pointer',
      boxShadow: '0 0 12px rgba(218, 178, 84, 0.08)'
    }
  }
  return {
    border: `1px solid ${kind === 'primary' ? 'rgba(218, 178, 84, 0.5)' : palette.borderStrong}`,
    background: kind === 'primary' ? 'rgba(218, 178, 84, 0.12)' : 'rgba(255, 255, 255, 0.05)',
    color: kind === 'primary' ? '#e8c968' : palette.text,
    padding: '5px 10px',
    borderRadius: 4,
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: 0.01,
    cursor: 'pointer'
  }
}
