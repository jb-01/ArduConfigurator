import { Panel, StatusBadge, buttonStyle } from '@arduconfig/ui-kit'

export interface LogsViewRow {
  paramId: string
  label: string
  formatted: string
  isSynced: boolean
}

export interface LogsViewProps {
  backendLabel: string
  backendDetailText: string
  retentionLabel: string
  retentionDetailText: string
  replayLabel: string
  replayDetailText: string
  rows: readonly LogsViewRow[]
  onOpenParameters: () => void
}

export function LogsView(props: LogsViewProps) {
  const {
    backendLabel,
    backendDetailText,
    retentionLabel,
    retentionDetailText,
    replayLabel,
    replayDetailText,
    rows,
    onOpenParameters
  } = props

  return (
    <div id="setup-panel-logs">
      <Panel
        title="Logs"
        subtitle="Read-only summary of onboard logging configuration. Edit values from the Parameters view."
      >
        <div className="modes-stack">
          <div className="modes-status">
            <article className="modes-status__card">
              <span>Log backend</span>
              <strong>{backendLabel}</strong>
              <small>{backendDetailText}</small>
            </article>
            <article className="modes-status__card">
              <span>Card retention</span>
              <strong>{retentionLabel}</strong>
              <small>{retentionDetailText}</small>
            </article>
            <article className="modes-status__card">
              <span>Replay logging</span>
              <strong>{replayLabel}</strong>
              <small>{replayDetailText}</small>
            </article>
          </div>

          <div
            className="modes-table"
            role="table"
            aria-label="Logging parameters"
            data-testid="logs-summary-table"
          >
            <div className="modes-table__row modes-table__row--head" role="row">
              <span role="columnheader">Parameter</span>
              <span role="columnheader">Setting</span>
              <span role="columnheader">Value</span>
              <span role="columnheader">State</span>
            </div>
            {rows.map((row) => (
              <div
                key={row.paramId}
                className="modes-table__row"
                role="row"
                data-testid={`logs-row-${row.paramId}`}
              >
                <span role="cell"><strong>{row.paramId}</strong></span>
                <span role="cell">{row.label}</span>
                <span role="cell">{row.formatted}</span>
                <span role="cell">
                  {row.isSynced ? (
                    <StatusBadge tone="neutral">synced</StatusBadge>
                  ) : (
                    <StatusBadge tone="warning">not synced</StatusBadge>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="modes-help">
            <p>
              Edit log backend, bitmask, retention, and replay settings from the Parameters view. A full inline editor and log-download surface will land in a follow-up.
            </p>
            <button
              type="button"
              style={buttonStyle()}
              data-testid="logs-go-to-parameters"
              onClick={onOpenParameters}
            >
              Open Parameters
            </button>
          </div>
        </div>
      </Panel>
    </div>
  )
}
