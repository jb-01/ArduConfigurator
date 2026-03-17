export type AccelerometerPoseId = 'level' | 'left' | 'right' | 'nose-down' | 'nose-up' | 'back'

interface AccelerometerPoseGuideProps {
  currentPose?: AccelerometerPoseId
}

const POSES: Array<{
  id: AccelerometerPoseId
  title: string
  instruction: string
  imageSrc: string
}> = [
  { id: 'level', title: 'Level', instruction: 'Set the vehicle level on a stable surface.', imageSrc: '/accel-poses/VehicleDown.png' },
  { id: 'left', title: 'Left Side', instruction: 'Rest the vehicle on its left side.', imageSrc: '/accel-poses/VehicleLeft.png' },
  { id: 'right', title: 'Right Side', instruction: 'Rest the vehicle on its right side.', imageSrc: '/accel-poses/VehicleRight.png' },
  { id: 'nose-down', title: 'Nose Down', instruction: 'Tilt the nose straight down.', imageSrc: '/accel-poses/VehicleNoseDown.png' },
  { id: 'nose-up', title: 'Nose Up', instruction: 'Tilt the nose straight up.', imageSrc: '/accel-poses/VehicleTailDown.png' },
  { id: 'back', title: 'Back', instruction: 'Flip the vehicle onto its back.', imageSrc: '/accel-poses/VehicleUpsideDown.png' }
]

export function AccelerometerPoseGuide({ currentPose = 'level' }: AccelerometerPoseGuideProps) {
  const current = POSES.find((pose) => pose.id === currentPose) ?? POSES[0]

  return (
    <div className="accelerometer-pose-guide">
      <div className="accelerometer-pose-guide__hero">
        <div className="accelerometer-pose-guide__header">
          <strong>Current Posture</strong>
          <span>{current.title}</span>
        </div>
        <div className="accelerometer-pose-guide__hero-visual">
          <img src={current.imageSrc} alt={`${current.title} accelerometer calibration pose`} />
        </div>
        <p>{current.instruction}</p>
      </div>

      <div className="accelerometer-pose-guide__steps" aria-label="Accelerometer calibration posture sequence">
        {POSES.map((pose, index) => (
          <div
            key={pose.id}
            className={`accelerometer-pose-guide__step${pose.id === current.id ? ' is-current' : ''}${
              index < POSES.findIndex((candidate) => candidate.id === current.id) ? ' is-complete' : ''
            }`}
          >
            <span className="accelerometer-pose-guide__step-index">{index + 1}</span>
            <div className="accelerometer-pose-guide__step-visual">
              <img src={pose.imageSrc} alt="" aria-hidden="true" />
            </div>
            <strong>{pose.title}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}
