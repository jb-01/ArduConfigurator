import { useEffect, useId, useMemo, useRef, useState } from 'react'

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

interface FlightDeckPreviewProps {
  rollDeg?: number
  pitchDeg?: number
  yawDeg?: number
  flightMode?: string
  verified: boolean
  frameClassLabel?: string
  frameTypeLabel?: string
  compact?: boolean
  testId?: string
}

interface ModelSceneState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  modelWrapper: THREE.Group
  model?: THREE.Object3D
}

interface TargetTelemetryState {
  pitchRad: number
  rollRad: number
  yawRad: number
  pitchVisual: number
  rollVisual: number
  headingDeg: number
}

interface CurrentTelemetryState extends TargetTelemetryState {}

interface DisplayTelemetryState {
  pitchVisual: number
  rollVisual: number
  headingDeg: number
}

const ZERO_TELEMETRY: TargetTelemetryState = {
  pitchRad: 0,
  rollRad: 0,
  yawRad: 0,
  pitchVisual: 0,
  rollVisual: 0,
  headingDeg: 0
}

const ATTITUDE_PITCH_MARKS = [-30, -20, -10, -5, 5, 10, 20, 30] as const

function renderScene(state: ModelSceneState): void {
  state.renderer.render(state.scene, state.camera)
}

function shortestAngleDeltaRadians(current: number, target: number): number {
  let delta = (target - current) % (Math.PI * 2)
  if (delta > Math.PI) {
    delta -= Math.PI * 2
  } else if (delta < -Math.PI) {
    delta += Math.PI * 2
  }
  return delta
}

function shortestAngleDeltaDegrees(current: number, target: number): number {
  let delta = (target - current) % 360
  if (delta > 180) {
    delta -= 360
  } else if (delta < -180) {
    delta += 360
  }
  return delta
}

function approachLinear(current: number, target: number, factor: number): number {
  return current + (target - current) * factor
}

function approachWrappedRadians(current: number, target: number, factor: number): number {
  return current + shortestAngleDeltaRadians(current, target) * factor
}

function approachWrappedDegrees(current: number, target: number, factor: number): number {
  return current + shortestAngleDeltaDegrees(current, target) * factor
}

function mountModel(
  state: ModelSceneState,
  model: THREE.Object3D,
  compact: boolean,
  scaleMode: 'betaflight' | 'fit' = 'fit'
): void {
  if (state.model) {
    state.modelWrapper.remove(state.model)
  }

  if (scaleMode === 'betaflight') {
    model.scale.setScalar(compact ? 15.5 : 18)
    model.position.set(0, 0, 0)
  } else {
    const box = new THREE.Box3().setFromObject(model)
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    model.position.sub(center)

    const maxDimension = Math.max(size.x, size.y, size.z, 1)
    const targetSize = compact ? 68 : 78
    const scale = targetSize / maxDimension
    model.scale.setScalar(scale)
  }

  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return
    }

    object.castShadow = false
    object.receiveShadow = false

    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        material.side = THREE.FrontSide
      })
      return
    }

    object.material.side = THREE.FrontSide
  })

  state.model = model
  state.modelWrapper.add(model)
  renderScene(state)
}

function createArm(length: number, headingRad: number): THREE.Mesh {
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, length, 18),
    new THREE.MeshStandardMaterial({ color: 0x182435, metalness: 0.35, roughness: 0.55 })
  )
  arm.rotation.z = Math.PI / 2
  arm.rotation.y = headingRad
  arm.position.set(Math.cos(headingRad) * (length / 2), 0, Math.sin(headingRad) * (length / 2))
  return arm
}

function createMotor(x: number, z: number, accentColor: number): THREE.Group {
  const motor = new THREE.Group()
  motor.position.set(x, 0, z)

  const can = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 0.24, 24),
    new THREE.MeshStandardMaterial({ color: 0x111821, metalness: 0.5, roughness: 0.36 })
  )
  can.position.y = 0.16
  motor.add(can)

  const propRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.64, 0.04, 10, 36),
    new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.1, roughness: 0.45 })
  )
  propRing.rotation.x = Math.PI / 2
  propRing.position.y = 0.24
  motor.add(propRing)

  return motor
}

function motorLayoutForModel(modelFile: string): Array<{ x: number; z: number }> {
  switch (modelFile) {
    case 'tricopter':
      return [
        { x: 0, z: -2.15 },
        { x: -1.95, z: 1.45 },
        { x: 1.95, z: 1.45 }
      ]
    case 'hex_plus':
      return [
        { x: 0, z: -2.35 },
        { x: 2.05, z: -1.05 },
        { x: 2.05, z: 1.05 },
        { x: 0, z: 2.35 },
        { x: -2.05, z: 1.05 },
        { x: -2.05, z: -1.05 }
      ]
    case 'hex_x':
    case 'y6':
      return [
        { x: 1.95, z: -1.15 },
        { x: 2.15, z: 1.1 },
        { x: 0, z: 2.35 },
        { x: -1.95, z: 1.15 },
        { x: -2.15, z: -1.1 },
        { x: 0, z: -2.35 }
      ]
    case 'quad_x':
    default:
      return [
        { x: -1.75, z: -1.75 },
        { x: 1.75, z: -1.75 },
        { x: -1.75, z: 1.75 },
        { x: 1.75, z: 1.75 }
      ]
  }
}

function createProceduralModel(modelFile: string): THREE.Group {
  const craft = new THREE.Group()

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.95, 0.34, 1.45),
    new THREE.MeshStandardMaterial({ color: 0xd8e3f3, metalness: 0.18, roughness: 0.56 })
  )
  body.position.y = 0.08
  craft.add(body)

  const topPlate = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.12, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x0f1722, metalness: 0.3, roughness: 0.5 })
  )
  topPlate.position.y = 0.33
  craft.add(topPlate)

  const stack = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.16, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x61dafb, metalness: 0.12, roughness: 0.38 })
  )
  stack.position.y = 0.48
  craft.add(stack)

  const motorPositions = motorLayoutForModel(modelFile)
  motorPositions.forEach(({ x, z }, index) => {
    const heading = Math.atan2(z, x)
    const length = Math.hypot(x, z)
    craft.add(createArm(length, heading))
    craft.add(createMotor(x, z, index % 2 === 0 ? 0x61dafb : 0xff815f))
  })

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 0.56, 3),
    new THREE.MeshStandardMaterial({ color: 0xff815f, metalness: 0.08, roughness: 0.32 })
  )
  nose.rotation.z = Math.PI / 2
  nose.position.set(0, 0.18, -1.08)
  craft.add(nose)

  const cameraPod = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.28, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x1a2330, metalness: 0.24, roughness: 0.42 })
  )
  cameraPod.position.set(0, 0.18, -0.76)
  craft.add(cameraPod)

  return craft
}

function clampDegrees(value: number | undefined, limit: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return 0
  }

  return Math.max(-limit, Math.min(limit, value))
}

function normalizeHeading(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) {
    return 0
  }

  const normalized = value % 360
  return normalized >= 0 ? normalized : normalized + 360
}

function modelFileForAirframe(frameClassLabel: string | undefined, frameTypeLabel: string | undefined): string {
  const frameClass = frameClassLabel?.toLowerCase() ?? ''
  const frameType = frameTypeLabel?.toLowerCase() ?? ''

  if (frameClass.includes('tricopter') || frameClass.includes('tri')) {
    return 'tricopter'
  }

  if (frameClass.includes('y6')) {
    return 'y6'
  }

  if (frameClass.includes('hex')) {
    return frameType.includes('+') || frameType.includes('plus') ? 'hex_plus' : 'hex_x'
  }

  if (frameClass.includes('quad')) {
    return 'quad_x'
  }

  return 'quad_x'
}

function formatDegrees(value: number | undefined): string {
  return value === undefined ? 'Unknown' : `${value.toFixed(1)}°`
}

function formatHeadingValue(value: number): string {
  return `${Math.round(normalizeHeading(value))}`.padStart(3, '0')
}

function formatCompassRoseLabel(value: number): string {
  const normalized = normalizeHeading(value)
  if (normalized === 0) {
    return 'N'
  }
  if (normalized === 45) {
    return 'NE'
  }
  if (normalized === 90) {
    return 'E'
  }
  if (normalized === 135) {
    return 'SE'
  }
  if (normalized === 180) {
    return 'S'
  }
  if (normalized === 225) {
    return 'SW'
  }
  if (normalized === 270) {
    return 'W'
  }
  if (normalized === 315) {
    return 'NW'
  }
  return `${Math.round(normalized / 10)}`.padStart(2, '0')
}

function compassRoseLabelTone(label: string): 'cardinal' | 'north' | 'intercardinal' | 'none' {
  if (!label) {
    return 'none'
  }
  if (label === 'N') {
    return 'north'
  }
  if (label === 'E' || label === 'S' || label === 'W') {
    return 'cardinal'
  }
  return 'intercardinal'
}

function polarPoint(centerX: number, centerY: number, radius: number, angleDegrees: number): { x: number; y: number } {
  const radians = ((angleDegrees - 90) * Math.PI) / 180
  return {
    x: centerX + Math.cos(radians) * radius,
    y: centerY + Math.sin(radians) * radius
  }
}

export function FlightDeckPreview({
  rollDeg,
  pitchDeg,
  yawDeg,
  flightMode,
  verified,
  frameClassLabel,
  frameTypeLabel,
  compact = false,
  testId
}: FlightDeckPreviewProps) {
  const attitudeClipPathId = useId().replace(/:/g, '')
  const headingClipPathId = useId().replace(/:/g, '')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sceneStateRef = useRef<ModelSceneState | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const loaderRef = useRef<GLTFLoader | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const previousAnimationTimeRef = useRef<number | null>(null)
  const targetTelemetryRef = useRef<TargetTelemetryState>({ ...ZERO_TELEMETRY })
  const currentTelemetryRef = useRef<CurrentTelemetryState>({ ...ZERO_TELEMETRY })
  const telemetryInitializedRef = useRef(false)
  const uiUpdateTimeRef = useRef(0)
  const [displayTelemetry, setDisplayTelemetry] = useState<DisplayTelemetryState>({
    pitchVisual: 0,
    rollVisual: 0,
    headingDeg: 0
  })

  const modelFile = useMemo(
    () => modelFileForAirframe(frameClassLabel, frameTypeLabel),
    [frameClassLabel, frameTypeLabel]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const viewport = viewportRef.current
    if (!canvas || !viewport) {
      return
    }

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 10000)
    camera.position.set(0, 0, 112)
    camera.lookAt(0, 0, 0)

    const modelWrapper = new THREE.Group()
    scene.add(camera)
    scene.add(modelWrapper)

    const ambient = new THREE.AmbientLight(0x565656, 1.05)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.65)
    keyLight.position.set(0.12, 1, 0.28)
    const fillLight = new THREE.DirectionalLight(0xa9bcc9, 0.78)
    fillLight.position.set(-0.55, 0.38, 1)
    const rimLight = new THREE.DirectionalLight(0x5f7486, 0.42)
    rimLight.position.set(0, -0.3, -1)

    scene.add(ambient)
    scene.add(keyLight)
    scene.add(fillLight)
    scene.add(rimLight)

    sceneStateRef.current = { renderer, scene, camera, modelWrapper }
    loaderRef.current = new GLTFLoader()

    const resize = () => {
      const width = viewport.clientWidth
      const height = viewport.clientHeight
      if (!width || !height || !sceneStateRef.current) {
        return
      }

      sceneStateRef.current.renderer.setSize(width, height, false)
      sceneStateRef.current.camera.aspect = width / height
      sceneStateRef.current.camera.updateProjectionMatrix()
      renderScene(sceneStateRef.current)
    }

    resize()

    const observer = new ResizeObserver(() => resize())
    observer.observe(viewport)
    resizeObserverRef.current = observer

    const animate = (now: number) => {
      animationFrameRef.current = window.requestAnimationFrame(animate)

      const state = sceneStateRef.current
      if (!state) {
        return
      }

      const previousTime = previousAnimationTimeRef.current ?? now
      previousAnimationTimeRef.current = now
      const deltaSeconds = Math.min((now - previousTime) / 1000, 0.05)
      const interpolationFactor = 1 - Math.exp(-deltaSeconds * 10)

      const target = targetTelemetryRef.current
      const current = currentTelemetryRef.current

      current.pitchRad = approachLinear(current.pitchRad, target.pitchRad, interpolationFactor)
      current.rollRad = approachLinear(current.rollRad, target.rollRad, interpolationFactor)
      current.yawRad = approachWrappedRadians(current.yawRad, target.yawRad, interpolationFactor)
      current.pitchVisual = approachLinear(current.pitchVisual, target.pitchVisual, interpolationFactor)
      current.rollVisual = approachLinear(current.rollVisual, target.rollVisual, interpolationFactor)
      current.headingDeg = approachWrappedDegrees(current.headingDeg, target.headingDeg, interpolationFactor)

      state.modelWrapper.rotation.y = -current.yawRad
      if (state.model) {
        state.model.rotation.x = current.pitchRad
        state.model.rotation.z = -current.rollRad
      }

      renderScene(state)

      if (now - uiUpdateTimeRef.current >= 33) {
        uiUpdateTimeRef.current = now
        setDisplayTelemetry({
          pitchVisual: current.pitchVisual,
          rollVisual: current.rollVisual,
          headingDeg: current.headingDeg
        })
      }
    }

    animationFrameRef.current = window.requestAnimationFrame(animate)

    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      previousAnimationTimeRef.current = null
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }

      const state = sceneStateRef.current
      if (state?.model) {
        state.modelWrapper.remove(state.model)
      }
      state?.renderer.dispose()
      sceneStateRef.current = null
      loaderRef.current = null
    }
  }, [])

  useEffect(() => {
    const state = sceneStateRef.current
    const loader = loaderRef.current
    if (!state || !loader) {
      return
    }

    const modelUrl = `${import.meta.env.BASE_URL}models/${modelFile}.gltf`
    let cancelled = false

    loader.load(
      modelUrl,
      (gltf) => {
        if (cancelled || !sceneStateRef.current) {
          return
        }

        mountModel(state, gltf.scene, compact, 'betaflight')
      },
      undefined,
      () => {
        if (!sceneStateRef.current) {
          return
        }
        mountModel(state, createProceduralModel(modelFile), compact, 'fit')
      }
    )

    return () => {
      cancelled = true
    }
  }, [compact, modelFile])

  useEffect(() => {
    const nextTelemetry = {
      pitchRad: clampDegrees(pitchDeg, 70) * (Math.PI / 180),
      rollRad: clampDegrees(rollDeg, 70) * (Math.PI / 180),
      yawRad: normalizeHeading(yawDeg) * (Math.PI / 180),
      pitchVisual: clampDegrees(pitchDeg, 28),
      rollVisual: clampDegrees(rollDeg, 50),
      headingDeg: normalizeHeading(yawDeg)
    }

    targetTelemetryRef.current = nextTelemetry

    if (!telemetryInitializedRef.current) {
      currentTelemetryRef.current = { ...nextTelemetry }
      telemetryInitializedRef.current = true
      setDisplayTelemetry({
        pitchVisual: nextTelemetry.pitchVisual,
        rollVisual: nextTelemetry.rollVisual,
        headingDeg: nextTelemetry.headingDeg
      })
    }
  }, [pitchDeg, rollDeg, yawDeg])

  const heading = normalizeHeading(displayTelemetry.headingDeg)
  const compassRoseMarks = useMemo(
    () =>
      Array.from({ length: 24 }, (_, index) => {
        const value = index * 15
        const outer = polarPoint(120, 104, 70, value)
        const labeled = value % 45 === 0
        const inner = polarPoint(120, 104, labeled ? 52 : value % 30 === 0 ? 57 : 61, value)
        const labelPoint = polarPoint(120, 104, 42, value)
        const label = labeled ? formatCompassRoseLabel(value) : ''
        return {
          value,
          major: labeled || value % 30 === 0,
          label,
          tone: compassRoseLabelTone(label),
          inner,
          outer,
          labelPoint
        }
      }),
    []
  )
  const digitalHeading = formatHeadingValue(heading)

  return (
    <div className={`flight-deck${compact ? ' flight-deck--compact' : ''}`} data-testid={testId}>
      <div className="flight-deck__model-shell">
        <div className={`flight-deck__model-frame${!verified ? ' is-standby' : ''}`} ref={viewportRef}>
          <canvas ref={canvasRef} className="flight-deck__canvas" />
          {!verified ? (
            <div className="flight-deck__standby">
              <strong>Preview staged</strong>
              <span>Attitude stream offline</span>
            </div>
          ) : null}
          {verified ? (
            <div className="flight-deck__hud">
              <span>ROLL {formatDegrees(rollDeg)}</span>
              <span>PITCH {formatDegrees(pitchDeg)}</span>
              <span>YAW {formatDegrees(yawDeg)}</span>
            </div>
          ) : null}
        </div>
        <div className="flight-deck__caption">
          <span>{verified ? 'Live craft preview' : 'Preview waiting on attitude telemetry'}</span>
          <strong>{flightMode ?? 'No active mode'}</strong>
        </div>
      </div>

      <div className="flight-deck__instruments">
        <div className="flight-instrument flight-instrument--attitude">
          <div className="flight-instrument__header-row">
            <div className="flight-instrument__title">Attitude</div>
            <span className={`flight-instrument__status${verified ? ' is-live' : ''}`}>{verified ? 'Live' : 'Standby'}</span>
          </div>
          <div className="flight-instrument__frame flight-instrument__frame--attitude">
            <svg className="flight-instrument__svg" viewBox="0 0 240 200" aria-hidden="true">
              <defs>
                <clipPath id={attitudeClipPathId}>
                  <rect x="26" y="38" width="188" height="124" rx="18" ry="18" />
                </clipPath>
              </defs>

              <rect className="flight-instrument__bezel" x="12" y="20" width="216" height="156" rx="24" ry="24" />
              <rect className="flight-instrument__screen" x="26" y="38" width="188" height="124" rx="18" ry="18" />

              <g clipPath={`url(#${attitudeClipPathId})`}>
                <g transform={`translate(120 100) rotate(${displayTelemetry.rollVisual}) translate(0 ${displayTelemetry.pitchVisual * 2.35})`}>
                  <rect className="flight-instrument__horizon-sky" x="-190" y="-200" width="380" height="200" />
                  <rect className="flight-instrument__horizon-ground" x="-190" y="0" width="380" height="200" />
                  <line className="flight-instrument__horizon-line" x1="-210" y1="0" x2="210" y2="0" />

                  {ATTITUDE_PITCH_MARKS.map((mark) => {
                    const y = -mark * 2.65
                    const longMark = Math.abs(mark) % 10 === 0
                    const halfWidth = longMark ? 34 : 18
                    return (
                      <g key={mark} className="flight-instrument__pitch-mark" transform={`translate(0 ${y})`}>
                        <line x1={-halfWidth} y1="0" x2={halfWidth} y2="0" />
                        <text x={-halfWidth - 10} y="4" textAnchor="end">
                          {Math.abs(mark)}
                        </text>
                        <text x={halfWidth + 10} y="4" textAnchor="start">
                          {Math.abs(mark)}
                        </text>
                      </g>
                    )
                  })}
                </g>
              </g>

              <path className="flight-instrument__reticle-wing" d="M 52 104 H 94 L 104 112 H 116" />
              <path className="flight-instrument__reticle-wing" d="M 188 104 H 146 L 136 112 H 124" />
              <rect className="flight-instrument__reticle-box" x="110" y="106" width="20" height="8" rx="2" ry="2" />
              <line className="flight-instrument__reticle-centerline" x1="120" y1="100" x2="120" y2="118" />
            </svg>
          </div>
          <div className="flight-instrument__readout-strip">
            <div className="flight-instrument__readout">
              <span>Roll</span>
              <strong>{formatDegrees(rollDeg)}</strong>
            </div>
            <div className="flight-instrument__readout">
              <span>Pitch</span>
              <strong>{formatDegrees(pitchDeg)}</strong>
            </div>
          </div>
          <div className="flight-deck__caption">
            <span>{verified ? 'Pitch / roll live' : 'No live ATTITUDE stream'}</span>
            <strong>{verified ? 'Synced' : 'Waiting'}</strong>
          </div>
        </div>

        <div className="flight-instrument flight-instrument--heading">
          <div className="flight-instrument__header-row">
            <div className="flight-instrument__title">Heading</div>
            <span className={`flight-instrument__status${verified ? ' is-live' : ''}`}>{verified ? 'Live' : 'Standby'}</span>
          </div>
          <div className="flight-instrument__frame flight-instrument__frame--heading">
            <svg className="flight-instrument__svg" viewBox="0 0 240 196" aria-hidden="true">
              <defs>
                <clipPath id={headingClipPathId}>
                  <circle cx="120" cy="104" r="72" />
                </clipPath>
              </defs>

              <rect className="flight-instrument__bezel" x="28" y="28" width="184" height="152" rx="34" ry="34" />
              <circle className="flight-instrument__compass-screen" cx="120" cy="104" r="72" />
              <circle className="flight-instrument__compass-ring" cx="120" cy="104" r="62" />

              <g clipPath={`url(#${headingClipPathId})`}>
                <g transform={`rotate(${-displayTelemetry.headingDeg} 120 104)`}>
                  {compassRoseMarks.map((mark) => (
                    <g key={mark.value}>
                      <line
                        className={`flight-instrument__compass-tick${mark.major ? ' is-major' : ''}`}
                        x1={mark.inner.x}
                        y1={mark.inner.y}
                        x2={mark.outer.x}
                        y2={mark.outer.y}
                      />
                      {mark.label ? (
                        <text
                          className={`flight-instrument__compass-label${mark.tone !== 'none' ? ` is-${mark.tone}` : ''}`}
                          x={mark.labelPoint.x}
                          y={mark.labelPoint.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          transform={`rotate(${displayTelemetry.headingDeg} ${mark.labelPoint.x} ${mark.labelPoint.y})`}
                        >
                          {mark.label}
                        </text>
                      ) : null}
                    </g>
                  ))}
                </g>
              </g>

              <line className="flight-instrument__compass-course-line" x1="120" y1="42" x2="120" y2="140" />
              <path className="flight-instrument__heading-pointer" d="M 120 34 L 128 48 H 112 Z" />
              <circle className="flight-instrument__compass-center" cx="120" cy="104" r="5" />
              <path className="flight-instrument__compass-center-marker" d="M 96 104 H 112 L 120 112 L 128 104 H 144" />
              <rect className="flight-instrument__heading-window" x="90" y="8" width="60" height="24" rx="6" ry="6" />
              <text className="flight-instrument__heading-window-text" x="120" y="24" textAnchor="middle">
                {digitalHeading}
              </text>
            </svg>
          </div>
          <div className="flight-instrument__readout-strip">
            <div className="flight-instrument__readout">
              <span>Heading</span>
              <strong>{Math.round(heading)}°</strong>
            </div>
            <div className="flight-instrument__readout">
              <span>Status</span>
              <strong>{verified ? 'Synced' : 'Waiting'}</strong>
            </div>
          </div>
          <div className="flight-deck__caption">
            <span>Current yaw heading</span>
            <strong>{Math.round(heading)}°</strong>
          </div>
        </div>
      </div>
    </div>
  )
}
