import type { Metadata } from 'next'

import { PracticeClient } from '../../ui/PracticeClient'

export const metadata: Metadata = {
  title: 'Practice Alone · Greener on the Other Side'
}

/** Practice Alone: a full match against Mr Pemberton next door. It needs no name and no connection. */
export default function PracticePage() {
  return <PracticeClient />
}
