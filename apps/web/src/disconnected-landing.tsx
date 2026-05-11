import type { ChangeEvent } from 'react'
import type { SessionProfile } from '@arduconfig/param-metadata'

export type LandingTransportMode = 'demo' | 'web-serial' | 'websocket'

export interface DisconnectedLandingProps {
  transportMode: LandingTransportMode
  onTransportModeChange: (mode: LandingTransportMode) => void
  webSerialSupported: boolean
  websocketUrl: string
  onWebsocketUrlChange: (url: string) => void
  websocketUrlPlaceholder: string
  sessionProfile: SessionProfile
  onSessionProfileChange: (profile: SessionProfile) => void
  connectLabel: string
  onConnect: () => void
  connectDisabled: boolean
}

interface BoardCard {
  id: string
  name: string
  image: string
}

const BOARDS: readonly BoardCard[] = [
  { id: 'pixhawk6x', name: 'Pixhawk 6X', image: '/boards/pixhawk6x/pixhawk6x-uart-map.svg' },
  { id: 'arkv6x', name: 'ARK V6X', image: '/boards/arkv6x/arkv6x-uart-map.svg' },
  { id: 'matekh743', name: 'Matek H743', image: '/boards/matekh743/matekh743-layout.svg' },
  { id: 'cuav-7-nano', name: 'CUAV 7 Nano', image: '/boards/cuav-7-nano/cuav-7-nano-uart-map.svg' },
  { id: 'ark-fpv', name: 'ARK FPV', image: '/boards/ark-fpv/ark-fpv-port-map.svg' }
]

interface CapabilityCard {
  title: string
  body: string
}

const CAPABILITIES: readonly CapabilityCard[] = [
  {
    title: 'Setup',
    body: 'Guided orientation, accelerometer and compass calibration, parameter sync, and first-flight checks.'
  },
  {
    title: 'Tune',
    body: 'Curated rates, gains, filters, and tuning profiles without hunting through the raw parameter tree.'
  },
  {
    title: 'Snapshot',
    body: 'Capture known-good baselines, build provisioning profiles, and roll back safely after risky changes.'
  },
  {
    title: 'Configure',
    body: 'Ports, receiver, outputs, power, OSD, and VTX from a single configuration-first surface.'
  }
]

export function DisconnectedLanding(props: DisconnectedLandingProps) {
  const {
    transportMode,
    onTransportModeChange,
    webSerialSupported,
    websocketUrl,
    onWebsocketUrlChange,
    websocketUrlPlaceholder,
    sessionProfile,
    onSessionProfileChange,
    connectLabel,
    onConnect,
    connectDisabled
  } = props

  const handleTransportChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onTransportModeChange(event.target.value as LandingTransportMode)
  }

  const handleSessionProfileChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onSessionProfileChange(event.target.value as SessionProfile)
  }

  return (
    <section className="landing" data-testid="disconnected-landing">
      <div className="landing__hero">
        <span className="landing__eyebrow">ArduConfigurator</span>
        <h1 className="landing__title">Configure your ArduPilot flight controller.</h1>
        <p className="landing__lede">
          A browser-first configurator built around safe writes, guided setup, and curated tuning. Plug in over USB,
          connect to a local bridge, or explore in demo mode without hardware.
        </p>
      </div>

      <div className="landing__connect" role="group" aria-label="Connect to a flight controller">
        <div className="landing__connect-copy">
          <h2>Connect a flight controller</h2>
          <p>Pick a transport, then connect. Demo mode uses a deterministic mock vehicle for exploring the UI.</p>
        </div>

        <div className="landing__connect-form">
          <label className="landing__field">
            <span>Transport</span>
            <select
              data-testid="landing-transport-select"
              value={transportMode}
              onChange={handleTransportChange}
              disabled={connectDisabled}
            >
              <option value="demo">Demo</option>
              <option value="web-serial" disabled={!webSerialSupported}>
                Serial{webSerialSupported ? '' : ' (n/a)'}
              </option>
              <option value="websocket">WebSocket</option>
            </select>
          </label>

          {transportMode === 'websocket' ? (
            <label className="landing__field landing__field--wide">
              <span>WebSocket URL</span>
              <input
                data-testid="landing-websocket-url-input"
                type="text"
                value={websocketUrl}
                onChange={(event) => onWebsocketUrlChange(event.target.value)}
                placeholder={websocketUrlPlaceholder}
                spellCheck={false}
                disabled={connectDisabled}
              />
            </label>
          ) : null}

          <label className="landing__field">
            <span>Session profile</span>
            <select
              data-testid="landing-session-profile-select"
              value={sessionProfile}
              onChange={handleSessionProfileChange}
              disabled={connectDisabled}
            >
              <option value="full-power">Full power</option>
              <option value="usb-bench">USB bench</option>
            </select>
          </label>

          <button
            type="button"
            data-testid="landing-connect-button"
            className="landing__connect-button"
            onClick={onConnect}
            disabled={connectDisabled}
          >
            {connectLabel}
          </button>
        </div>
      </div>

      <div className="landing__section">
        <header className="landing__section-header">
          <h2>What you can do</h2>
          <p>Configuration-first surfaces, with snapshots and presets to make changes recoverable.</p>
        </header>
        <ul className="landing__capability-grid" role="list">
          {CAPABILITIES.map((capability) => (
            <li key={capability.title} className="landing__capability">
              <strong>{capability.title}</strong>
              <span>{capability.body}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="landing__section">
        <header className="landing__section-header">
          <h2>Supported boards</h2>
          <p>Tested against these flight controllers. Other ArduPilot targets generally work via the same transports.</p>
        </header>
        <ul className="landing__board-grid" role="list">
          {BOARDS.map((board) => (
            <li key={board.id} className="landing__board">
              <div className="landing__board-image">
                <img src={board.image} alt="" loading="lazy" />
              </div>
              <span className="landing__board-name">{board.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
