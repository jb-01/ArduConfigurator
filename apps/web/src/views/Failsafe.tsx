import { Panel, StatusBadge, buttonStyle } from '@arduconfig/ui-kit'

export interface FailsafeViewRow {
  source: string
  paramId: string
  formatted: string
  isSynced: boolean
}

export interface FailsafeViewProps {
  rcFailsafeLabel: string
  rcFailsafeThresholdText: string
  batteryLowLabel: string
  batteryLowThresholdText: string
  batteryCriticalLabel: string
  batteryCriticalThresholdText: string
  rows: readonly FailsafeViewRow[]
  onOpenPower: () => void
}

export function FailsafeView(props: FailsafeViewProps) {
  const {
    rcFailsafeLabel,
    rcFailsafeThresholdText,
    batteryLowLabel,
    batteryLowThresholdText,
    batteryCriticalLabel,
    batteryCriticalThresholdText,
    rows,
    onOpenPower
  } = props

  return (
    <div id="setup-panel-failsafe">
      <Panel
        title="Failsafe"
        subtitle="Read-only overview of RC, battery, and advanced failsafe parameters. Edit values from the Power view."
      >
        <div className="modes-stack">
          <div className="modes-status">
            <article className="modes-status__card">
              <span>RC failsafe</span>
              <strong>{rcFailsafeLabel}</strong>
              <small>{rcFailsafeThresholdText}</small>
            </article>
            <article className="modes-status__card">
              <span>Battery low</span>
              <strong>{batteryLowLabel}</strong>
              <small>{batteryLowThresholdText}</small>
            </article>
            <article className="modes-status__card">
              <span>Battery critical</span>
              <strong>{batteryCriticalLabel}</strong>
              <small>{batteryCriticalThresholdText}</small>
            </article>
          </div>

          <div className="modes-table" role="table" aria-label="Failsafe parameters" data-testid="failsafe-summary-table">
            <div className="modes-table__row modes-table__row--head" role="row">
              <span role="columnheader">Source</span>
              <span role="columnheader">Parameter</span>
              <span role="columnheader">Value</span>
              <span role="columnheader">State</span>
            </div>
            {rows.map((row) => (
              <div key={row.paramId} className="modes-table__row" role="row" data-testid={`failsafe-row-${row.paramId}`}>
                <span role="cell">{row.source}</span>
                <span role="cell"><strong>{row.paramId}</strong></span>
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
              Edit failsafe thresholds and actions from the Power view&apos;s failsafe section. GCS- and EKF-failsafe parameters are not yet wired into the metadata catalog.
            </p>
            <button
              type="button"
              style={buttonStyle()}
              data-testid="failsafe-go-to-power"
              onClick={onOpenPower}
            >
              Open Power
            </button>
          </div>
        </div>
      </Panel>
    </div>
  )
}
