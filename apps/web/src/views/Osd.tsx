import { Panel, StatusBadge, buttonStyle } from '@arduconfig/ui-kit'
import type { ParameterState } from '@arduconfig/ardupilot-core'

import { ScopedSelectField, type ScopedFieldDraftMap } from './ScopedField'

export interface OsdLinkPort {
  portNumber: number
  label: string
  protocolLabel: string
}

export interface OsdSelectField {
  parameter: ParameterState
  liveValue: number | undefined
}

export interface OsdMspOptionsBit {
  bit: number
  label: string
  isChecked: boolean
}

export interface OsdMspOptionsField {
  parameter: ParameterState
  bits: readonly OsdMspOptionsBit[]
  captionText: string
  onToggleBit: (bit: number, on: boolean) => void
}

export interface OsdPreviewToolbarData {
  backendText: string
  switchingText: string
  cellsText: string
}

export interface OsdPreviewHudData {
  linkText: string
  flightModeText: string
  backendText: string
  altitudeText: string
  headingText: string
  batteryText: string
  cellsText: string
  rssiText: string
}

export interface OsdViewProps {
  linkPorts: readonly OsdLinkPort[]
  typeField: OsdSelectField | undefined
  channelField: OsdSelectField | undefined
  switchMethodField: OsdSelectField | undefined
  previewToolbar: OsdPreviewToolbarData
  previewHud: OsdPreviewHudData
  mspConfigPills: readonly string[]
  cellCountField: OsdSelectField | undefined
  mspOptionsField: OsdMspOptionsField | undefined
  editedValues: Record<string, string>
  onEditChange: (paramId: string, value: string) => void
  draftStatusById: ScopedFieldDraftMap
  stagedCount: number
  invalidCount: number
  draftCount: number
  canApply: boolean
  isApplying: boolean
  isBusy: boolean
  onApply: () => void
  onRevert: () => void
}

function fieldStatusClass(draftStatusById: ScopedFieldDraftMap, paramId: string): string {
  return draftStatusById.get(paramId)?.status ?? 'unchanged'
}

export function OsdView(props: OsdViewProps) {
  const {
    linkPorts,
    typeField,
    channelField,
    switchMethodField,
    previewToolbar,
    previewHud,
    mspConfigPills,
    cellCountField,
    mspOptionsField,
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

  return (
    <section className="grid one-up">
      <Panel
        title="OSD"
        subtitle="Use a dedicated OSD workspace while keeping the current ArduPilot capability boundary explicit."
      >
        <div className="bf-tab-stack">
          <div className="bf-note">
            <p>Assign the matching serial role in Ports first. This tab owns the pilot-facing overlay workflow after the transport path is in place.</p>
            <p>
              {linkPorts.length > 0
                ? `Detected display path: ${linkPorts.map((port) => `${port.label} (${port.protocolLabel})`).join(', ')}`
                : 'No MSP / DisplayPort OSD link detected in current port roles.'}
            </p>
          </div>

          <div className="bf-osd-grid">
            <article className="bf-gui-box bf-osd-grid__left">
              <div className="bf-gui-box__titlebar">
                <strong>Elements / Backend</strong>
              </div>
              <div className="bf-gui-box__body">
                <p className="setup-gui-box__note">ArduPilot currently exposes backend, page channel, and switching mode first. A fuller selectable element list still needs broader OSD metadata coverage.</p>
                <div className="bf-compact-field-grid">
                  {typeField ? (
                    <ScopedSelectField
                      parameter={typeField.parameter}
                      liveValue={typeField.liveValue}
                      editedValues={editedValues}
                      onChange={onEditChange}
                      draftStatusById={draftStatusById}
                    />
                  ) : null}
                  {channelField ? (
                    <ScopedSelectField
                      parameter={channelField.parameter}
                      liveValue={channelField.liveValue}
                      editedValues={editedValues}
                      onChange={onEditChange}
                      draftStatusById={draftStatusById}
                    />
                  ) : null}
                  {switchMethodField ? (
                    <ScopedSelectField
                      parameter={switchMethodField.parameter}
                      liveValue={switchMethodField.liveValue}
                      editedValues={editedValues}
                      onChange={onEditChange}
                      draftStatusById={draftStatusById}
                    />
                  ) : null}
                </div>
              </div>
            </article>

            <article className="bf-gui-box bf-osd-grid__center">
              <div className="bf-gui-box__titlebar">
                <strong>Preview</strong>
              </div>
              <div className="bf-gui-box__body">
                <div className="bf-osd-preview-toolbar">
                  <span>{previewToolbar.backendText}</span>
                  <span>{previewToolbar.switchingText}</span>
                  <span>{previewToolbar.cellsText}</span>
                </div>
                <div className="bf-osd-preview-screen">
                  <div className="bf-osd-preview-screen__hud">
                    <span className="bf-osd-preview-screen__item bf-osd-preview-screen__item--top-left">
                      {previewHud.linkText}
                    </span>
                    <span className="bf-osd-preview-screen__item bf-osd-preview-screen__item--top-center">
                      {previewHud.flightModeText}
                    </span>
                    <span className="bf-osd-preview-screen__item bf-osd-preview-screen__item--top-right">
                      {previewHud.backendText}
                    </span>
                    <span className="bf-osd-preview-screen__item bf-osd-preview-screen__item--mid-left">
                      {previewHud.altitudeText}
                    </span>
                    <span className="bf-osd-preview-screen__item bf-osd-preview-screen__item--center" aria-hidden="true">+</span>
                    <span className="bf-osd-preview-screen__item bf-osd-preview-screen__item--mid-right">
                      {previewHud.headingText}
                    </span>
                    <span className="bf-osd-preview-screen__item bf-osd-preview-screen__item--bottom-left">
                      {previewHud.batteryText}
                    </span>
                    <span className="bf-osd-preview-screen__item bf-osd-preview-screen__item--bottom-center">
                      {previewHud.cellsText}
                    </span>
                    <span className="bf-osd-preview-screen__item bf-osd-preview-screen__item--bottom-right">
                      {previewHud.rssiText}
                    </span>
                  </div>
                </div>
                <div className="bf-osd-preview-footer">
                  <StatusBadge tone="neutral">read-only preview</StatusBadge>
                  <p>Live battery, attitude, and link telemetry render here. Element positions are illustrative until per-element OSD parameters are wired through.</p>
                </div>
              </div>
            </article>

            <article className="bf-gui-box bf-osd-grid__right">
              <div className="bf-gui-box__titlebar">
                <strong>MSP / DisplayPort</strong>
              </div>
              <div className="bf-gui-box__body">
                <div className="config-pills">
                  {mspConfigPills.length > 0
                    ? mspConfigPills.map((pill, index) => <span key={`osd-msp-pill:${index}`}>{pill}</span>)
                    : <span>No active display link</span>}
                </div>

                {cellCountField ? (
                  <ScopedSelectField
                    parameter={cellCountField.parameter}
                    liveValue={cellCountField.liveValue}
                    editedValues={editedValues}
                    onChange={onEditChange}
                    draftStatusById={draftStatusById}
                  />
                ) : null}

                {mspOptionsField ? (
                  <label className={`scoped-editor-field scoped-editor-field--compact scoped-editor-field--${fieldStatusClass(draftStatusById, mspOptionsField.parameter.id)}`}>
                    <span>{mspOptionsField.parameter.definition?.label ?? mspOptionsField.parameter.id}</span>
                    <div className="scoped-checkbox-list">
                      {mspOptionsField.bits.map((bit) => (
                        <label key={`${mspOptionsField.parameter.id}:${bit.bit}`} className="scoped-checkbox-option">
                          <input
                            type="checkbox"
                            checked={bit.isChecked}
                            onChange={(event) => mspOptionsField.onToggleBit(bit.bit, event.target.checked)}
                          />
                          <span>{bit.label}</span>
                        </label>
                      ))}
                    </div>
                    <small>{mspOptionsField.captionText}</small>
                  </label>
                ) : null}
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
              {isApplying ? 'Applying…' : `Save OSD (${stagedCount})`}
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
