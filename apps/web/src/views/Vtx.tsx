import { Panel, StatusBadge, buttonStyle } from '@arduconfig/ui-kit'
import type { ParameterState } from '@arduconfig/ardupilot-core'

export interface VtxLinkPort {
  label: string
  protocolLabel: string
}

export interface VtxField {
  parameter: ParameterState
  liveValue: number | undefined
}

export interface VtxViewProps {
  linkPorts: readonly VtxLinkPort[]
  enabledLabel: string
  enableField: VtxField | undefined
  frequencyField: VtxField | undefined
  powerField: VtxField | undefined
  maxPowerField: VtxField | undefined
  optionsField: VtxField | undefined
  editedValues: Record<string, string>
  onEditChange: (paramId: string, value: string) => void
  draftStatusById: ReadonlyMap<string, { status: string }>
  stagedCount: number
  invalidCount: number
  draftCount: number
  canApply: boolean
  isApplying: boolean
  isBusy: boolean
  onApply: () => void
  onRevert: () => void
}

function fieldStatusClass(draftStatusById: ReadonlyMap<string, { status: string }>, paramId: string): string {
  return draftStatusById.get(paramId)?.status ?? 'unchanged'
}

export function VtxView(props: VtxViewProps) {
  const {
    linkPorts,
    enabledLabel,
    enableField,
    frequencyField,
    powerField,
    maxPowerField,
    optionsField,
    editedValues,
    onEditChange,
    draftStatusById,
    stagedCount,
    invalidCount,
    draftCount,
    canApply,
    isApplying,
    isBusy,
    onApply,
    onRevert
  } = props

  const enabled = enableField?.liveValue
  const frequency = frequencyField?.liveValue
  const power = powerField?.liveValue
  const maxPower = maxPowerField?.liveValue
  const options = optionsField?.liveValue

  return (
    <section className="grid one-up">
      <Panel
        title="VTX"
        subtitle="Use a dedicated VTX workflow while keeping the actual ArduPilot-backed controls visible and honest."
      >
        <div className="bf-tab-stack">
          <div className="bf-note">
            <p>Assign the control UART in Ports first. This tab is for transmitter-facing behavior, not the serial-role assignment itself.</p>
            <p>
              {linkPorts.length > 0
                ? `Detected control path: ${linkPorts.map((port) => `${port.label} (${port.protocolLabel})`).join(', ')}`
                : 'No VTX control link detected in current port roles.'}
            </p>
          </div>

          <div className="bf-vtx-grid">
            <article className="bf-gui-box bf-vtx-grid__config">
              <div className="bf-gui-box__titlebar">
                <strong>Selected Mode</strong>
              </div>
              <div className="bf-gui-box__body">
                <div className="config-pills">
                  {enableField ? <span>Control: {enabledLabel}</span> : null}
                  {frequencyField ? <span>Frequency: {frequency !== undefined ? `${frequency} MHz` : 'Unknown'}</span> : null}
                  {powerField ? <span>Power: {power !== undefined ? `${power} mW` : 'Unknown'}</span> : null}
                  {maxPowerField ? <span>Max power: {maxPower !== undefined ? `${maxPower} mW` : 'Unknown'}</span> : null}
                </div>

                <div className="bf-compact-field-grid">
                  {enableField ? (
                    <label className={`scoped-editor-field scoped-editor-field--compact scoped-editor-field--${fieldStatusClass(draftStatusById, enableField.parameter.id)}`}>
                      <span>{enableField.parameter.definition?.label ?? enableField.parameter.id}</span>
                      <select
                        value={editedValues[enableField.parameter.id] ?? String(enabled ?? '')}
                        onChange={(event) => onEditChange(enableField.parameter.id, event.target.value)}
                      >
                        {(enableField.parameter.definition?.options ?? []).map((valueOption) => (
                          <option key={`${enableField.parameter.id}:${valueOption.value}`} value={String(valueOption.value)}>
                            {valueOption.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {frequencyField ? (
                    <label className={`scoped-editor-field scoped-editor-field--compact scoped-editor-field--${fieldStatusClass(draftStatusById, frequencyField.parameter.id)}`}>
                      <span>{frequencyField.parameter.definition?.label ?? frequencyField.parameter.id}</span>
                      <input
                        type="number"
                        min={frequencyField.parameter.definition?.minimum}
                        max={frequencyField.parameter.definition?.maximum}
                        step={frequencyField.parameter.definition?.step ?? 1}
                        value={editedValues[frequencyField.parameter.id] ?? String(frequency ?? '')}
                        onChange={(event) => onEditChange(frequencyField.parameter.id, event.target.value)}
                      />
                    </label>
                  ) : null}

                  {powerField ? (
                    <label className={`scoped-editor-field scoped-editor-field--compact scoped-editor-field--${fieldStatusClass(draftStatusById, powerField.parameter.id)}`}>
                      <span>{powerField.parameter.definition?.label ?? powerField.parameter.id}</span>
                      <input
                        type="number"
                        min={powerField.parameter.definition?.minimum}
                        max={powerField.parameter.definition?.maximum}
                        step={powerField.parameter.definition?.step ?? 1}
                        value={editedValues[powerField.parameter.id] ?? String(power ?? '')}
                        onChange={(event) => onEditChange(powerField.parameter.id, event.target.value)}
                      />
                    </label>
                  ) : null}

                  {maxPowerField ? (
                    <label className={`scoped-editor-field scoped-editor-field--compact scoped-editor-field--${fieldStatusClass(draftStatusById, maxPowerField.parameter.id)}`}>
                      <span>{maxPowerField.parameter.definition?.label ?? maxPowerField.parameter.id}</span>
                      <input
                        type="number"
                        min={maxPowerField.parameter.definition?.minimum}
                        max={maxPowerField.parameter.definition?.maximum}
                        step={maxPowerField.parameter.definition?.step ?? 1}
                        value={editedValues[maxPowerField.parameter.id] ?? String(maxPower ?? '')}
                        onChange={(event) => onEditChange(maxPowerField.parameter.id, event.target.value)}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            </article>

            <article className="bf-gui-box bf-vtx-grid__status">
              <div className="bf-gui-box__titlebar">
                <strong>Actual State</strong>
              </div>
              <div className="bf-gui-box__body">
                <div className="bf-gui-box__kv-list">
                  <div className="bf-gui-box__kv-row">
                    <span>Device ready</span>
                    <strong>{linkPorts.length > 0 ? 'Linked' : 'Not detected'}</strong>
                  </div>
                  <div className="bf-gui-box__kv-row">
                    <span>Control</span>
                    <strong>{enabledLabel}</strong>
                  </div>
                  <div className="bf-gui-box__kv-row">
                    <span>Frequency</span>
                    <strong>{frequency !== undefined ? `${frequency} MHz` : 'Unknown'}</strong>
                  </div>
                  <div className="bf-gui-box__kv-row">
                    <span>Power</span>
                    <strong>{power !== undefined ? `${power} mW` : 'Unknown'}</strong>
                  </div>
                  <div className="bf-gui-box__kv-row">
                    <span>Max power</span>
                    <strong>{maxPower !== undefined ? `${maxPower} mW` : 'Unknown'}</strong>
                  </div>
                  <div className="bf-gui-box__kv-row">
                    <span>Advanced</span>
                    <strong>{options !== undefined ? String(options) : 'N/A'}</strong>
                  </div>
                </div>
              </div>
            </article>

            <article className="bf-gui-box bf-vtx-grid__advanced">
              <div className="bf-gui-box__titlebar">
                <strong>VTX Table / Advanced</strong>
              </div>
              <div className="bf-gui-box__body">
                <p className="setup-gui-box__note">ArduPilot currently exposes frequency, power, max power, and an advanced options bitmask here instead of a full band/channel table.</p>
                <div className="bf-vtx-advanced-grid">
                  {optionsField ? (
                    <label className={`scoped-editor-field scoped-editor-field--compact scoped-editor-field--${fieldStatusClass(draftStatusById, optionsField.parameter.id)}`}>
                      <span>{optionsField.parameter.definition?.label ?? optionsField.parameter.id}</span>
                      <input
                        type="number"
                        min={optionsField.parameter.definition?.minimum}
                        max={optionsField.parameter.definition?.maximum}
                        step={optionsField.parameter.definition?.step ?? 1}
                        value={editedValues[optionsField.parameter.id] ?? String(options ?? '')}
                        onChange={(event) => onEditChange(optionsField.parameter.id, event.target.value)}
                      />
                      <small>Keep this exposed so the ArduPilot gap stays obvious instead of hidden.</small>
                    </label>
                  ) : null}

                  <div className="bf-vtx-callout">
                    <StatusBadge tone="warning">Table not available</StatusBadge>
                    <p>When ArduPilot grows explicit VTX band/channel table support, this box should turn into a full table editor instead of staying a placeholder.</p>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div className="bf-toolbar">
            <div className="bf-toolbar__status">
              <span>{stagedCount} staged</span>
              <span>{invalidCount} invalid</span>
            </div>
            <button
              type="button"
              style={buttonStyle('primary')}
              onClick={onApply}
              disabled={isBusy || stagedCount === 0 || invalidCount > 0 || !canApply}
            >
              {isApplying ? 'Applying…' : `Save VTX (${stagedCount})`}
            </button>
            <button
              type="button"
              style={buttonStyle()}
              onClick={onRevert}
              disabled={isBusy || draftCount === 0}
            >
              Revert
            </button>
          </div>
        </div>
      </Panel>
    </section>
  )
}
