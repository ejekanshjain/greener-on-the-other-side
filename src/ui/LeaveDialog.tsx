'use client'

import { Button } from '../shared/ui/Button'
import { Modal } from '../shared/ui/Modal'
import { COPY } from './copy'

/**
 * "Leave the match?" from the menu or the browser's Back during a match. Leaving before
 * Brenda decides the match hands your neighbour the win.
 */
export function LeaveDialog({
  open,
  decided,
  onStay,
  onLeave
}: {
  open: boolean
  /** True once Brenda has decided the match, so leaving changes nothing. */
  decided: boolean
  onStay: () => void
  onLeave: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onStay}
      title={COPY.leaveTitle}
      footer={
        <>
          <Button variant="ghost" onClick={onStay}>
            Stay
          </Button>
          <Button variant="danger" onClick={onLeave}>
            Leave
          </Button>
        </>
      }
    >
      <p data-testid="leave-dialog">
        {decided ? COPY.leaveDecided : COPY.leaveForfeit}
      </p>
    </Modal>
  )
}
