import { useEffect, useMemo, useRef, useState } from 'react'

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
  attitudeGroup: THREE.Group
  model?: THREE.Object3D
}

interface TelemetryState {
  attitudeQuaternion: THREE.Quaternion
  pitchVisual: number
  rollVisual: number
  headingDeg: number
}

interface TargetTelemetryState extends TelemetryState {}

interface CurrentTelemetryState extends TelemetryState {}

interface DisplayTelemetryState {
  pitchVisual: number
  rollVisual: number
  headingDeg: number
}

const HEADING_TAPE_WINDOW_DEGREES = 120
const HEADING_TAPE_STEP_DEGREES = 5
const PITCH_AXIS = new THREE.Vector3(1, 0, 0)
const ROLL_AXIS = new THREE.Vector3(0, 0, 1)
const YAW_AXIS = new THREE.Vector3(0, 1, 0)
// Flight assets are authored Y-up with the nose on -Z. Rotate once so zero-attitude
// renders nose-up on screen, then keep live roll/pitch/yaw purely on the attitude group.
const MODEL_MOUNT_QUATERNION = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))

function createTelemetryState(): TelemetryState {
  return {
    attitudeQuaternion: new THREE.Quaternion(),
    pitchVisual: 0,
    rollVisual: 0,
    headingDeg: 0
  }
}

function renderScene(state: ModelSceneState): void {
  state.renderer.render(state.scene, state.camera)
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
    state.attitudeGroup.remove(state.model)
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
  state.attitudeGroup.add(model)
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

function offsetHeading(value: number | undefined, offsetDeg: number): number | undefined {
  if (value === undefined || Number.isNaN(value)) {
    return undefined
  }

  return normalizeHeading(value - offsetDeg)
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

function formatHeadingTapeLabel(value: number): string {
  const normalized = normalizeHeading(value)
  if (normalized === 0) {
    return 'N'
  }
  if (normalized === 90) {
    return 'E'
  }
  if (normalized === 180) {
    return 'S'
  }
  if (normalized === 270) {
    return 'W'
  }
  return `${Math.round(normalized)}`.padStart(3, '0')
}

function headingTapeLabelTone(value: number): 'north' | 'cardinal' | 'numeric' {
  const normalized = normalizeHeading(value)
  if (normalized === 0) {
    return 'north'
  }
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return 'cardinal'
  }
  return 'numeric'
}

function buildAttitudeQuaternion(rollDeg: number | undefined, pitchDeg: number | undefined, yawDeg: number | undefined): THREE.Quaternion {
  const pitchRad = clampDegrees(pitchDeg, 70) * (Math.PI / 180)
  const rollRad = clampDegrees(rollDeg, 70) * (Math.PI / 180)
  const yawRad = normalizeHeading(yawDeg) * (Math.PI / 180)

  const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(YAW_AXIS, -yawRad)
  const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(PITCH_AXIS, pitchRad)
  const rollQuaternion = new THREE.Quaternion().setFromAxisAngle(ROLL_AXIS, -rollRad)

  return yawQuaternion.multiply(pitchQuaternion).multiply(rollQuaternion)
}

function buildHeadingTapeMarks(headingDeg: number): Array<{
  value: number
  leftPercent: number
  major: boolean
  label?: string
  tone: 'north' | 'cardinal' | 'numeric'
}> {
  const halfWindow = HEADING_TAPE_WINDOW_DEGREES / 2

  return Array.from({ length: 360 / HEADING_TAPE_STEP_DEGREES }, (_, index) => index * HEADING_TAPE_STEP_DEGREES)
    .map((value) => {
      const delta = shortestAngleDeltaDegrees(headingDeg, value)
      return { value, delta }
    })
    .filter((mark) => Math.abs(mark.delta) <= halfWindow)
    .sort((left, right) => left.delta - right.delta)
    .map((mark) => ({
      value: mark.value,
      leftPercent: 50 + (mark.delta / halfWindow) * 50,
      major: mark.value % 10 === 0,
      label: mark.value % 30 === 0 ? formatHeadingTapeLabel(mark.value) : undefined,
      tone: headingTapeLabelTone(mark.value)
    }))
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sceneStateRef = useRef<ModelSceneState | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const loaderRef = useRef<GLTFLoader | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const previousAnimationTimeRef = useRef<number | null>(null)
  const targetTelemetryRef = useRef<TargetTelemetryState>(createTelemetryState())
  const currentTelemetryRef = useRef<CurrentTelemetryState>(createTelemetryState())
  const telemetryInitializedRef = useRef(false)
  const uiUpdateTimeRef = useRef(0)
  const [benchHeadingOffsetDeg, setBenchHeadingOffsetDeg] = useState<number | null>(null)
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
    modelWrapper.quaternion.copy(MODEL_MOUNT_QUATERNION)
    const attitudeGroup = new THREE.Group()
    modelWrapper.add(attitudeGroup)
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

    sceneStateRef.current = { renderer, scene, camera, modelWrapper, attitudeGroup }
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

      current.attitudeQuaternion.slerp(target.attitudeQuaternion, interpolationFactor)
      current.pitchVisual = approachLinear(current.pitchVisual, target.pitchVisual, interpolationFactor)
      current.rollVisual = approachLinear(current.rollVisual, target.rollVisual, interpolationFactor)
      current.headingDeg = approachWrappedDegrees(current.headingDeg, target.headingDeg, interpolationFactor)

      state.attitudeGroup.quaternion.copy(current.attitudeQuaternion)

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
        state.attitudeGroup.remove(state.model)
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
    const headingOffsetDeg = benchHeadingOffsetDeg ?? 0
    const adjustedYawDeg = offsetHeading(yawDeg, headingOffsetDeg)
    const nextTelemetry = {
      attitudeQuaternion: buildAttitudeQuaternion(rollDeg, pitchDeg, adjustedYawDeg),
      pitchVisual: clampDegrees(pitchDeg, 28),
      rollVisual: clampDegrees(rollDeg, 50),
      headingDeg: normalizeHeading(adjustedYawDeg)
    }

    targetTelemetryRef.current = {
      attitudeQuaternion: nextTelemetry.attitudeQuaternion.clone(),
      pitchVisual: nextTelemetry.pitchVisual,
      rollVisual: nextTelemetry.rollVisual,
      headingDeg: nextTelemetry.headingDeg
    }

    if (!telemetryInitializedRef.current) {
      currentTelemetryRef.current = {
        attitudeQuaternion: nextTelemetry.attitudeQuaternion.clone(),
        pitchVisual: nextTelemetry.pitchVisual,
        rollVisual: nextTelemetry.rollVisual,
        headingDeg: nextTelemetry.headingDeg
      }
      telemetryInitializedRef.current = true
      setDisplayTelemetry({
        pitchVisual: nextTelemetry.pitchVisual,
        rollVisual: nextTelemetry.rollVisual,
        headingDeg: nextTelemetry.headingDeg
      })
    }
  }, [benchHeadingOffsetDeg, pitchDeg, rollDeg, yawDeg])

  const heading = normalizeHeading(displayTelemetry.headingDeg)
  const headingTapeMarks = useMemo(() => buildHeadingTapeMarks(heading), [heading])
  const digitalHeading = formatHeadingValue(heading)
  const headingStatusLabel = benchHeadingOffsetDeg === null ? 'Absolute heading' : 'Bench-forward zeroed'

  function handleSetBenchForward(): void {
    const sourceHeading = yawDeg !== undefined && !Number.isNaN(yawDeg) ? normalizeHeading(yawDeg) : normalizeHeading(displayTelemetry.headingDeg)
    setBenchHeadingOffsetDeg(sourceHeading)
  }

  function handleClearBenchForward(): void {
    setBenchHeadingOffsetDeg(null)
  }

  return (
    <div className={`flight-deck${compact ? ' flight-deck--compact' : ''}`} data-testid={testId}>
      <div className="flight-deck__model-shell">
        <div className={`flight-deck__model-frame${!verified ? ' is-standby' : ''}`} ref={viewportRef}>
          <canvas ref={canvasRef} className="flight-deck__canvas" />
          <div className="flight-deck__heading-tape" aria-hidden="true">
            <div className="flight-deck__heading-window">
              <div className="flight-deck__heading-ruler">
                {headingTapeMarks.map((mark) => (
                  <div
                    key={mark.value}
                    className={`flight-deck__heading-mark${mark.major ? ' is-major' : ''}${mark.tone === 'north' ? ' is-north' : mark.tone === 'cardinal' ? ' is-cardinal' : ''}`}
                    style={{ left: `${mark.leftPercent}%` }}
                  >
                    <span className="flight-deck__heading-mark-tick" />
                    {mark.label ? <span className="flight-deck__heading-mark-label">{mark.label}</span> : null}
                  </div>
                ))}
              </div>
              <div className="flight-deck__heading-cursor">
                <span>{digitalHeading}°</span>
              </div>
            </div>
          </div>
          <div className="flight-deck__reticle" aria-hidden="true">
            <span className="flight-deck__reticle-wing flight-deck__reticle-wing--left" />
            <span className="flight-deck__reticle-core" />
            <span className="flight-deck__reticle-wing flight-deck__reticle-wing--right" />
          </div>
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
              <span>HDG {formatDegrees(heading)}</span>
            </div>
          ) : null}
        </div>
        <div className="flight-deck__caption">
          <div className="flight-deck__caption-copy">
            <span>{verified ? 'Quaternion-synced craft preview with integrated heading tape' : 'Preview waiting on attitude telemetry'}</span>
            <strong>{flightMode ?? 'No active mode'}</strong>
          </div>
          <div className="flight-deck__caption-actions">
            <span className={`flight-deck__heading-reference${benchHeadingOffsetDeg !== null ? ' is-relative' : ''}`}>{headingStatusLabel}</span>
            <div className="flight-deck__heading-actions">
              <button
                type="button"
                className="flight-deck__heading-button"
                disabled={!verified}
                onClick={handleSetBenchForward}
                data-testid="flight-deck-zero-heading-button"
              >
                Set Bench Forward
              </button>
              {benchHeadingOffsetDeg !== null ? (
                <button
                  type="button"
                  className="flight-deck__heading-button is-secondary"
                  onClick={handleClearBenchForward}
                  data-testid="flight-deck-clear-heading-button"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flight-deck__readout-grid">
          <article className={`flight-deck__readout-card${verified ? ' is-live' : ''}`}>
            <span>Roll</span>
            <strong>{formatDegrees(rollDeg)}</strong>
            <small>Live bank attitude from the 3D craft view.</small>
          </article>
          <article className={`flight-deck__readout-card${verified ? ' is-live' : ''}`}>
            <span>Pitch</span>
            <strong>{formatDegrees(pitchDeg)}</strong>
            <small>Forward / aft tilt with quaternion interpolation.</small>
          </article>
          <article className={`flight-deck__readout-card${verified ? ' is-live' : ''}`}>
            <span>Heading</span>
            <strong>{Math.round(heading)}°</strong>
            <small>{benchHeadingOffsetDeg === null ? 'Centered on the HUD heading tape.' : 'Relative to the saved bench-forward heading.'}</small>
          </article>
          <article className={`flight-deck__readout-card${verified ? ' is-live' : ''}`}>
            <span>Link State</span>
            <strong>{verified ? 'Synced' : 'Waiting'}</strong>
            <small>{verified ? 'ATTITUDE stream active.' : 'Preview is holding the staged pose.'}</small>
          </article>
        </div>
      </div>
    </div>
  )
}
