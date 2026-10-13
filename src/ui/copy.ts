/** Every room screen's copy, from the room table in DESIGN.md. */
export const COPY = {
  connecting: 'Opening the garden gate…',
  unreachable:
    "Can't reach the garden. Check your signal or play Practice Alone.",
  quota: 'The garden is closed for today. Play Practice Alone instead.',
  aloneStarted: 'Send the link to your neighbour.',
  aloneLink: 'Waiting for your neighbour. Keep this page open.',
  aloneTyped: "Nobody's here yet. Check the code with your friend.",
  full: 'Two people are already here. If one is you, close the other tab or app.',
  elsewhere: 'This room is open in another tab.',
  moved: 'This game moved to another tab.',
  badLink: "That link isn't a room.",
  copied: 'Link copied',
  comeBack: 'Come back here after you send it.',
  shareText: 'Come and throw gnomes at my lawn.',
  waitingReady: (name: string) => `Waiting for ${name} to press Ready.`,
  howTo: [
    'Throw every weed, snail and gnome over the fence.',
    'Rub the grass to mow. Hold still to water.',
    'Brenda judges both lawns when the clock runs out.'
  ],
  menuNote: 'The round keeps going while this is open.',
  practiceLoading: 'Mr Pemberton is putting his boots on…',
  practiceMoods:
    "He's polite in round 1, normal in round 2 and petty in round 3.",
  practiceWaiting: 'Mr Pemberton is on his way to the fence.',
  motionHint:
    'Stops screen shake. Brenda fades the tint instead of peeling it.',
  howToPlay: [
    'Swipe weeds, snails and gnomes at the fence. Let go while still moving.',
    'A soft throw clips the fence and drops back onto your lawn.',
    'Rub the grass to mow stripes. Hold still on brown grass to water it.',
    'Press the tap to refill the can. Turn it off before it floods.',
    'Drag the full grass bag to the compost, or swipe it over the fence.',
    'Tap Biscuit while he circles, or he digs a hole.',
    'At 0:40 the shed opens. Hold heavy junk to lift it, then throw it.',
    'Brenda scores Green, Stripes, Tidy and Junk. Win 2 rounds to take the match.'
  ],
  keys: 'F shakes your fist. Escape opens the menu.',
  leaveTitle: 'Leave the Match?',
  leaveForfeit: 'Your neighbour wins.',
  leaveDecided: 'The result stands.',
  stormedOff: (name: string) => `${name} stormed off. You win.`,
  walkover: (name: string) => `${name} didn't come back. You win.`,
  walkedOver: (name: string) => `You didn't come back in time. ${name} wins.`,
  noContest: 'The line went dead. Nobody wins.',
  reconnecting: 'Reconnecting…',
  upright: 'Turn your phone upright.',
  keepsGoing: 'The round keeps going.',
  away: 'Away',
  gone: 'Gone',
  left: (name: string) => `${name} left.`,
  waitingRematch: (name: string) => `Waiting for ${name}.`,
  wantsRematch: (name: string) => `${name} wants a rematch.`
} as const
