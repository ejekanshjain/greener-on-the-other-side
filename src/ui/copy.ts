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
  /** What Brenda Counts: each score line's name, then what it counts. */
  brendaCounts: [
    { name: 'Green', line: 'up to 50: how healthy your grass is.' },
    {
      name: 'Stripes',
      line: '2.5 each: a column mown short, fence to patio, with nothing on it at 0:00.'
    },
    {
      name: 'Tidy',
      line: 'up to 20: each weed, snail, hole, bit of litter or clippings patch costs half a point.'
    },
    {
      name: 'Junk',
      line: 'no limit: each gnome on your grass costs 1, a bin or mower 4, a trampoline 6.'
    }
  ],
  brendaCountsTitle: 'What Brenda Counts',
  brendaRounds: 'Win 2 of 3 rounds. Each round lasts 3 minutes.',
  isReady: (name: string) => `${name} is ready.`,
  tryYard: 'Try the Yard',
  yardTitle: 'The Yard',
  yardStep: (step: number) => `Step ${step} of 3`,
  skip: 'Skip',
  menuNote: 'The round keeps going while this is open.',
  practiceLoading: 'Mr Pemberton is putting his boots on…',
  practiceMoods:
    "He's polite in round 1, normal in round 2 and petty in round 3.",
  practiceWaiting: 'Mr Pemberton is on his way to the fence.',
  motionHint:
    'Stops screen shake. Brenda fades the tint instead of peeling it.',
  howToPlay: [
    'Press a weed, snail or gnome to grab it. On bare grass, drag slowly to mow, or hold still to water.',
    'Swipe what you grabbed up at the fence. Let go while still moving.',
    'Drag a weed until it pops out of the ground, then swipe it up.',
    'Throw about once a second. Throwing faster tires your arm: throws fall short, then stop.',
    'A soft throw clips the fence and drops back onto your lawn.',
    'Mow slowly up and down a whole column to stripe it.',
    'Hold still on brown grass to water it. Stop when it sparkles.',
    'Press the tap to fill the can. Press it again before it floods.',
    'Drag the full grass bag onto the compost and hold. Or swipe it over the fence.',
    'Press Biscuit while he circles, or he digs a hole.',
    'At 0:40 the shed opens. Throw the gnomes, then mow your stripes back.',
    'Heavy junk: slide it halfway up the lawn and let go. Then hold it until it lifts, and swipe up hard.',
    'Press something while it falls over the fence to catch it.'
  ],
  moreBelow: 'More below',
  keys: 'F shakes your fist. Escape opens the menu.',
  leaveTitle: 'Leave the Match?',
  leaveForfeit: 'Your neighbour wins.',
  leaveDecided: 'The result stands.',
  stormedOff: (name: string) => `${name} stormed off. You win.`,
  walkover: (name: string) => `${name} didn't come back. You win.`,
  walkedOver: (name: string) => `You didn't come back in time. ${name} wins.`,
  noContest: 'The line went dead. Nobody wins.',
  reconnecting: 'Reconnecting…',
  paused: 'Paused',
  upright: 'Turn your phone upright.',
  keepsGoing: 'The round keeps going.',
  away: 'Away',
  firstMatch: 'First Match',
  gone: 'Gone',
  left: (name: string) => `${name} left.`,
  waitingRematch: (name: string) => `Waiting for ${name}.`,
  wantsRematch: (name: string) => `${name} wants a rematch.`
} as const
