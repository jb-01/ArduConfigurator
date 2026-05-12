import { Panel, StatusBadge, buttonStyle } from '@arduconfig/ui-kit'

export interface ModesViewSlot {
  position: number
  pwmLabel: string
  modeLabel: string
  paramSynced: boolean
  isActive: boolean
}

export interface ModesViewProps {
  modeChannelLabel: string
  currentSlotLabel: string
  currentSlotSubtext: string
  activeModeLabel: string
  slots: readonly ModesViewSlot[]
  onOpenFlightModeTask: () => void
}

export function ModesView(props: ModesViewProps) {
  const {
    modeChannelLabel,
    currentSlotLabel,
    currentSlotSubtext,
    activeModeLabel,
    slots,
    onOpenFlightModeTask
  } = props

  return (
    <div id="setup-panel-modes">
      <Panel
        title="Modes"
        subtitle="Flight-mode assignments for the configured switch channel and a live indicator on the active slot."
      >
        <div className="modes-stack">
          <div className="modes-status">
            <article className="modes-status__card">
              <span>Mode channel</span>
              <strong>{modeChannelLabel}</strong>
              <small>FLTMODE_CH selects which RC channel switches the flight mode.</small>
            </article>
            <article className="modes-status__card">
              <span>Current slot</span>
              <strong>{currentSlotLabel}</strong>
              <small>{currentSlotSubtext}</small>
            </article>
            <article className="modes-status__card">
              <span>Active mode</span>
              <strong>{activeModeLabel}</strong>
              <small>Mode reported by the vehicle heartbeat.</small>
            </article>
          </div>

          <div className="modes-table" role="table" aria-label="Flight mode slots" data-testid="modes-slot-table">
            <div className="modes-table__row modes-table__row--head" role="row">
              <span role="columnheader">Slot</span>
              <span role="columnheader">PWM range</span>
              <span role="columnheader">Assigned mode</span>
              <span role="columnheader">State</span>
            </div>
            {slots.map((slot) => (
              <div
                key={slot.position}
                className={`modes-table__row${slot.isActive ? ' is-active' : ''}`}
                role="row"
                data-testid={`modes-slot-${slot.position}`}
              >
                <span role="cell"><strong>{slot.position}</strong></span>
                <span role="cell">{slot.pwmLabel}</span>
                <span role="cell">{slot.modeLabel}</span>
                <span role="cell">
                  {slot.isActive ? (
                    <StatusBadge tone="success">live</StatusBadge>
                  ) : !slot.paramSynced ? (
                    <StatusBadge tone="warning">not synced</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">—</StatusBadge>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="modes-help">
            <p>Edit per-slot mode assignments from the Receiver view&apos;s Flight Mode task.</p>
            <button
              type="button"
              style={buttonStyle()}
              data-testid="modes-go-to-flight-mode-task"
              onClick={onOpenFlightModeTask}
            >
              Open Receiver → Flight Mode
            </button>
          </div>
        </div>
      </Panel>
    </div>
  )
}
