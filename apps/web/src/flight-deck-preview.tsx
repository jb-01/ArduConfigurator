import { useEffect, useMemo, useRef } from 'react'

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
  wrapper: THREE.Group
  model?: THREE.Object3D
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

  return 'fallback'
}

function formatDegrees(value: number | undefined): string {
  return value === undefined ? 'Unknown' : `${value.toFixed(1)}°`
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
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(0, 2.8, 7.4)

    const wrapper = new THREE.Group()
    scene.add(wrapper)

    const ambient = new THREE.AmbientLight(0xc7dcff, 1.7)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2)
    keyLight.position.set(5, 8, 6)
    const fillLight = new THREE.DirectionalLight(0x77b9ff, 0.8)
    fillLight.position.set(-4, -3, 5)

    scene.add(ambient)
    scene.add(keyLight)
    scene.add(fillLight)

    const floor = new THREE.Mesh(
      new THREE.RingGeometry(2.45, 2.72, 64),
      new THREE.MeshBasicMaterial({ color: 0x27405d, transparent: true, opacity: 0.52, side: THREE.DoubleSide })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -1.3
    scene.add(floor)

    sceneStateRef.current = { renderer, scene, camera, wrapper }
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
      sceneStateRef.current.renderer.render(sceneStateRef.current.scene, sceneStateRef.current.camera)
    }

    resize()

    const observer = new ResizeObserver(() => resize())
    observer.observe(viewport)
    resizeObserverRef.current = observer

    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null

      const state = sceneStateRef.current
      if (state?.model) {
        state.wrapper.remove(state.model)
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

        if (state.model) {
          state.wrapper.remove(state.model)
        }

        const model = gltf.scene
        model.scale.setScalar(compact ? 1.45 : 1.65)
        model.position.set(0, -0.35, 0)
        model.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = false
            object.receiveShadow = false
          }
        })

        state.model = model
        state.wrapper.add(model)
        state.renderer.render(state.scene, state.camera)
      },
      undefined,
      () => {
        if (!sceneStateRef.current) {
          return
        }

        const fallback = new THREE.Group()

        const body = new THREE.Mesh(
          new THREE.BoxGeometry(1.4, 0.24, 0.95),
          new THREE.MeshStandardMaterial({ color: 0xdce9f7, metalness: 0.2, roughness: 0.65 })
        )
        fallback.add(body)

        const armGeometry = new THREE.CylinderGeometry(0.08, 0.08, 3.1, 20)
        const armMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2330, metalness: 0.35, roughness: 0.5 })
        const armA = new THREE.Mesh(armGeometry, armMaterial)
        armA.rotation.z = Math.PI / 2
        armA.rotation.y = Math.PI / 4
        fallback.add(armA)
        const armB = armA.clone()
        armB.rotation.y = -Math.PI / 4
        fallback.add(armB)

        const motorGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 24)
        const motorMaterial = new THREE.MeshStandardMaterial({ color: 0x64d9ff, metalness: 0.3, roughness: 0.4 })
        ;[
          [-1.05, 0.12, -1.05],
          [1.05, 0.12, -1.05],
          [-1.05, 0.12, 1.05],
          [1.05, 0.12, 1.05]
        ].forEach(([x, y, z]) => {
          const motor = new THREE.Mesh(motorGeometry, motorMaterial)
          motor.position.set(x, y, z)
          fallback.add(motor)
        })

        const nose = new THREE.Mesh(
          new THREE.ConeGeometry(0.18, 0.45, 3),
          new THREE.MeshStandardMaterial({ color: 0xff7e63, metalness: 0.1, roughness: 0.35 })
        )
        nose.rotation.z = Math.PI / 2
        nose.position.set(0, 0.06, -0.82)
        fallback.add(nose)

        fallback.scale.setScalar(compact ? 1.2 : 1.35)
        fallback.position.set(0, -0.35, 0)

        if (state.model) {
          state.wrapper.remove(state.model)
        }

        state.model = fallback
        state.wrapper.add(fallback)
        state.renderer.render(state.scene, state.camera)
      }
    )

    return () => {
      cancelled = true
    }
  }, [compact, modelFile])

  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) {
      return
    }

    const pitch = clampDegrees(pitchDeg, 70) * (Math.PI / 180)
    const roll = clampDegrees(rollDeg, 70) * (Math.PI / 180)
    const yaw = normalizeHeading(yawDeg) * (Math.PI / 180)

    state.wrapper.rotation.set(-pitch, yaw, -roll)
    state.renderer.render(state.scene, state.camera)
  }, [pitchDeg, rollDeg, yawDeg])

  const pitchVisual = clampDegrees(pitchDeg, 28)
  const rollVisual = clampDegrees(rollDeg, 50)
  const heading = normalizeHeading(yawDeg)

  return (
    <div className={`flight-deck${compact ? ' flight-deck--compact' : ''}`} data-testid={testId}>
      <div className="flight-deck__model-shell">
        <div className="flight-deck__model-frame" ref={viewportRef}>
          <canvas ref={canvasRef} className="flight-deck__canvas" />
          <div className="flight-deck__hud">
            <span>ROLL {formatDegrees(rollDeg)}</span>
            <span>PITCH {formatDegrees(pitchDeg)}</span>
            <span>YAW {formatDegrees(yawDeg)}</span>
          </div>
        </div>
        <div className="flight-deck__caption">
          <span>{verified ? 'Live craft preview' : 'Preview waiting on attitude telemetry'}</span>
          <strong>{flightMode ?? 'No active mode'}</strong>
        </div>
      </div>

      <div className="flight-deck__instruments">
        <div className="flight-instrument">
          <div className="flight-instrument__title">Attitude</div>
          <div className="flight-instrument__dial">
            <div className="flight-instrument__horizon">
              <div
                className={`flight-instrument__world${verified ? ' is-live' : ''}`}
                style={{ transform: `translateY(${pitchVisual * 1.7}px) rotate(${rollVisual}deg)` }}
              >
                <div className="flight-instrument__sky" />
                <div className="flight-instrument__ground" />
                <div className="flight-instrument__line" />
              </div>
              <div className="flight-instrument__reticle">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
          <div className="flight-deck__caption">
            <span>{verified ? 'Pitch / roll live' : 'No live ATTITUDE stream'}</span>
            <strong>{verified ? 'Synced' : 'Waiting'}</strong>
          </div>
        </div>

        <div className="flight-instrument">
          <div className="flight-instrument__title">Heading</div>
          <div className="flight-instrument__dial flight-instrument__dial--heading">
            <div className="flight-instrument__heading-ring" style={{ transform: `rotate(${-heading}deg)` }}>
              <span className="flight-instrument__cardinal flight-instrument__cardinal--north">N</span>
              <span className="flight-instrument__cardinal flight-instrument__cardinal--east">E</span>
              <span className="flight-instrument__cardinal flight-instrument__cardinal--south">S</span>
              <span className="flight-instrument__cardinal flight-instrument__cardinal--west">W</span>
            </div>
            <div className="flight-instrument__needle" />
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
