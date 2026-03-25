import { readFile } from 'node:fs/promises'

import { MockTransport, ReplayTransport, parseRecordedSession } from '@arduconfig/transport'
import { createArduCopterMockScenario } from '@arduconfig/protocol-mavlink'
import { TcpTransport, UdpTransport } from '@arduconfig/sitl-harness'

import { NativeSerialTransport } from './native-serial-transport.js'
import { startWebSocketBridgeServer } from './websocket-bridge-server.js'

interface BridgeOptions {
  host: string
  port: number
  route: string
  source: 'demo' | 'serial' | 'replay' | 'tcp' | 'udp-listen' | 'udp-connect'
  serialPath?: string
  baudRate: number
  replayFile?: string
  targetHost?: string
  targetPort?: number
  bindHost?: string
  bindPort?: number
}

const DEFAULT_OPTIONS: BridgeOptions = {
  host: '127.0.0.1',
  port: 14550,
  route: '/',
  source: 'demo',
  baudRate: 115200,
  bindHost: '0.0.0.0',
  bindPort: 14551
}

void main().catch((error) => {
  console.error(`[bridge] ${error instanceof Error ? error.message : 'Unknown bridge error.'}`)
  process.exitCode = 1
})

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const transport = await createBridgeTransport(options)
  const bridge = await startWebSocketBridgeServer({
    transport,
    host: options.host,
    port: options.port,
    route: options.route,
    label: describeSource(options)
  })

  console.log(`[bridge] source=${describeSource(options)}`)
  console.log(`[bridge] listening=${bridge.url}`)
  console.log('[bridge] press Ctrl+C to stop')

  const shutdown = async () => {
    await bridge.close().catch(() => {})
    process.exit(0)
  }

  process.once('SIGINT', () => {
    void shutdown()
  })
  process.once('SIGTERM', () => {
    void shutdown()
  })
}

async function createBridgeTransport(options: BridgeOptions) {
  switch (options.source) {
    case 'demo': {
      const scenario = createArduCopterMockScenario()
      return new MockTransport('bridge-demo-transport', {
        initialFrames: scenario.initialFrames,
        respondToOutbound: scenario.respondToOutbound,
        frameIntervalMs: 12,
        responseDelayMs: 20,
        chunkSize: 7
      })
    }
    case 'serial':
      if (!options.serialPath) {
        throw new Error('Pass --path=/dev/tty.* when using --source=serial.')
      }
      return new NativeSerialTransport('bridge-native-serial', {
        path: options.serialPath,
        baudRate: options.baudRate
      })
    case 'replay':
      if (!options.replayFile) {
        throw new Error('Pass --replay-file=/path/to/session.json when using --source=replay.')
      }
      return new ReplayTransport('bridge-replay-transport', {
        session: parseRecordedSession(await readFile(options.replayFile, 'utf8')),
        speedMultiplier: 1
      })
    case 'tcp':
      if (!options.targetHost || !options.targetPort) {
        throw new Error('Pass --target-host=HOST and --target-port=PORT when using --source=tcp.')
      }
      return new TcpTransport('bridge-tcp-transport', {
        host: options.targetHost,
        port: options.targetPort
      })
    case 'udp-listen':
      if (!options.bindPort) {
        throw new Error('Pass --bind-port=PORT when using --source=udp-listen.')
      }
      return new UdpTransport('bridge-udp-listen-transport', {
        bindHost: options.bindHost,
        bindPort: options.bindPort
      })
    case 'udp-connect':
      if (!options.targetHost || !options.targetPort) {
        throw new Error('Pass --target-host=HOST and --target-port=PORT when using --source=udp-connect.')
      }
      if (!options.bindPort) {
        throw new Error('Pass --bind-port=PORT when using --source=udp-connect.')
      }
      return new UdpTransport('bridge-udp-connect-transport', {
        bindHost: options.bindHost,
        bindPort: options.bindPort,
        remoteHost: options.targetHost,
        remotePort: options.targetPort
      })
  }
}

function parseArgs(args: string[]): BridgeOptions {
  const options: BridgeOptions = { ...DEFAULT_OPTIONS }

  for (const argument of args) {
    if (argument === '--demo') {
      options.source = 'demo'
      continue
    }
    if (argument === '--serial') {
      options.source = 'serial'
      continue
    }
    if (argument === '--replay') {
      options.source = 'replay'
      continue
    }
    if (argument === '--tcp') {
      options.source = 'tcp'
      continue
    }
    if (argument === '--udp-listen') {
      options.source = 'udp-listen'
      continue
    }
    if (argument === '--udp-connect') {
      options.source = 'udp-connect'
      continue
    }

    const valueIndex = argument.indexOf('=')
    if (!argument.startsWith('--') || valueIndex === -1) {
      continue
    }

    const key = argument.slice(2, valueIndex)
    const value = argument.slice(valueIndex + 1)
    switch (key) {
      case 'host':
        options.host = value || DEFAULT_OPTIONS.host
        break
      case 'port':
        options.port = Number.parseInt(value, 10) || DEFAULT_OPTIONS.port
        break
      case 'route':
        options.route = value || DEFAULT_OPTIONS.route
        break
      case 'path':
        options.serialPath = value
        options.source = 'serial'
        break
      case 'baud-rate':
        options.baudRate = Number.parseInt(value, 10) || DEFAULT_OPTIONS.baudRate
        break
      case 'replay-file':
        options.replayFile = value
        options.source = 'replay'
        break
      case 'target-host':
        options.targetHost = value
        break
      case 'target-port':
        options.targetPort = Number.isFinite(Number.parseInt(value, 10)) ? Number.parseInt(value, 10) : undefined
        break
      case 'bind-host':
        options.bindHost = value || DEFAULT_OPTIONS.bindHost
        break
      case 'bind-port':
        options.bindPort = Number.isFinite(Number.parseInt(value, 10)) ? Number.parseInt(value, 10) : undefined
        break
      default:
        break
    }
  }

  return options
}

function describeSource(options: BridgeOptions): string {
  const targetPortLabel = options.targetPort !== undefined ? String(options.targetPort) : 'unknown'
  const bindPortLabel = options.bindPort !== undefined ? String(options.bindPort) : String(DEFAULT_OPTIONS.bindPort)

  switch (options.source) {
    case 'demo':
      return 'demo mock vehicle'
    case 'serial':
      return `serial ${options.serialPath ?? 'unknown'} @ ${options.baudRate}`
    case 'replay':
      return `replay ${options.replayFile ?? 'unknown'}`
    case 'tcp':
      return `tcp ${options.targetHost ?? 'unknown'}:${targetPortLabel}`
    case 'udp-listen':
      return `udp listen ${options.bindHost ?? DEFAULT_OPTIONS.bindHost}:${bindPortLabel}`
    case 'udp-connect':
      return `udp connect ${options.targetHost ?? 'unknown'}:${targetPortLabel} from ${options.bindHost ?? DEFAULT_OPTIONS.bindHost}:${bindPortLabel}`
  }
}
