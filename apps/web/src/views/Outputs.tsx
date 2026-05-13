import type { ReactNode } from 'react'
import { Panel, StatusBadge } from '@arduconfig/ui-kit'

export type OutputsStatusTone = 'success' | 'warning' | 'danger' | 'neutral'

export type OutputsTaskId = 'motor-setup' | 'direction-test' | 'esc-protocol' | 'peripherals' | 'review'

export interface OutputsTaskCard {
  id: OutputsTaskId
  label: string
  value: string
  detail: string
  tone: OutputsStatusTone
}

export interface OutputsViewProps {
  taskCards: readonly OutputsTaskCard[]
  activeTaskId: OutputsTaskId
  activeTask: OutputsTaskCard
  onSelectTask: (taskId: OutputsTaskId) => void
  overviewSlot: ReactNode
  taskBodySlot: ReactNode
  reviewDockSlot?: ReactNode
}

export function OutputsView(props: OutputsViewProps) {
  const { taskCards, activeTaskId, activeTask, onSelectTask, overviewSlot, taskBodySlot, reviewDockSlot } = props

  return (
    <div id="setup-panel-outputs">
      <Panel
        title="Airframe & Outputs"
        subtitle="Review frame geometry, output assignments, and key motor/peripheral settings before any output testing."
      >
        <div className="telemetry-stack telemetry-stack--outputs">
          <div className="outputs-summary-grid">
            {taskCards.map((task) => (
              <button
                key={task.id}
                type="button"
                data-testid={`outputs-summary-${task.id}`}
                className={`outputs-summary-card${task.id === activeTaskId ? ' is-active' : ''}`}
                onClick={() => onSelectTask(task.id)}
              >
                <div className="outputs-summary-card__header">
                  <span>{task.label}</span>
                  <StatusBadge tone={task.tone}>{task.value}</StatusBadge>
                </div>
                <p>{task.detail}</p>
              </button>
            ))}
          </div>

          <div className="outputs-workspace outputs-workspace--task-deck">
            <div className="outputs-workspace__overview outputs-overview">{overviewSlot}</div>

            <div className="outputs-workspace__task outputs-task-deck">
              <div className="outputs-task-deck__header">
                <div>
                  <h3>{activeTask.label}</h3>
                  <p>{activeTask.detail}</p>
                </div>
                <StatusBadge tone={activeTask.tone}>{activeTask.value}</StatusBadge>
              </div>

              <div className="outputs-task-nav" data-testid="outputs-task-nav">
                {taskCards.map((task) => (
                  <button
                    key={`outputs-task-nav:${task.id}`}
                    type="button"
                    className={`outputs-task-nav__button${task.id === activeTaskId ? ' is-active' : ''}`}
                    onClick={() => onSelectTask(task.id)}
                  >
                    <span>{task.label}</span>
                    <small>{task.value}</small>
                  </button>
                ))}
              </div>

              {taskBodySlot}
            </div>
          </div>

          {reviewDockSlot}
        </div>
      </Panel>
    </div>
  )
}
