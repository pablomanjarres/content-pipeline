// Default 100-shot B-roll catalog tailored to Pablo:
// startup founder (building openclaw / content-pipeline in public),
// gym + swim, college student, personal brand creator on IG.
//
// Each shot lists the *planned* shot sizes — which framings Pablo wants
// to capture for that specific b-roll. The actual files dropped into the
// folder count as "recorded" regardless of size; size is a planning hint.
//
// Folder layout on disk:
//   <media-root>/brolls/<categoryId>/<typeId>/<shotId>/<file>.mov

export type ShotSize = 'close' | 'medium' | 'wide'
export type ShotKind = 'illustrative' | 'emotional' | 'establishing' | 'detail'

export interface BrollShot {
  id: string
  name: string
  shotSizes: ShotSize[]
  duration: string
  kind: ShotKind
  tags: string[]
  notes?: string
  series?: string
}

export interface BrollType {
  id: string
  name: string
  shots: BrollShot[]
}

export interface BrollCategory {
  id: string
  name: string
  icon: string
  color: string
  description?: string
  types: BrollType[]
}

export interface BrollCatalog {
  version: 1
  categories: BrollCategory[]
}

export const DEFAULT_BROLL_CATALOG: BrollCatalog = {
  version: 1,
  categories: [
    {
      id: 'founder-life',
      name: 'Founder Life',
      icon: 'rocket',
      color: '#a78bfa',
      description: 'Building the startup. Deep work, late nights, calls, ship moments.',
      types: [
        {
          id: 'deep-work',
          name: 'Deep Work',
          shots: [
            { id: 'typing-laptop-overhead', name: 'Typing on laptop, overhead', shotSizes: ['close', 'medium'], duration: '4-8s', kind: 'illustrative', tags: ['founder', 'office', 'tech'], notes: 'Hands only. Fast cadence, no face.' },
            { id: 'multiple-terminals-pan', name: 'Multiple terminal windows, slow pan', shotSizes: ['close', 'medium'], duration: '4-6s', kind: 'illustrative', tags: ['code', 'tech'], notes: 'Lit screen in dim room reads best.' },
            { id: 'two-monitor-split', name: 'Two monitors — code + dashboard', shotSizes: ['medium', 'wide'], duration: '3-6s', kind: 'illustrative', tags: ['founder', 'tech'] },
            { id: 'standing-desk-rise', name: 'Standing desk rising, side profile', shotSizes: ['medium', 'wide'], duration: '4-7s', kind: 'detail', tags: ['founder', 'office'] },
            { id: 'whiteboard-thinking', name: 'Whiteboard sticky-notes wall', shotSizes: ['close', 'medium', 'wide'], duration: '4-10s', kind: 'illustrative', tags: ['founder', 'planning'] },
            { id: 'whiteboard-erase-redraw', name: 'Whiteboard erase + redraw timelapse', shotSizes: ['medium', 'wide'], duration: '6-10s', kind: 'illustrative', tags: ['founder', 'planning'] },
            { id: 'notebook-architecture-sketch', name: 'Sketching architecture in notebook', shotSizes: ['close'], duration: '4-7s', kind: 'detail', tags: ['founder', 'planning'] },
            { id: 'headphones-focus-side', name: 'Headphones on, side profile focus mode', shotSizes: ['medium'], duration: '3-6s', kind: 'emotional', tags: ['founder', 'focus'] },
            { id: 'late-night-desk-lamp', name: 'Late-night desk lamp glow', shotSizes: ['medium', 'wide'], duration: '4-8s', kind: 'establishing', tags: ['founder', 'night'] },
            { id: 'late-night-commit-timestamp', name: 'Late-night commit, timestamp visible', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['founder', 'code', 'night'] },
          ],
        },
        {
          id: 'ship-moments',
          name: 'Ship Moments',
          shots: [
            { id: 'deploy-button-click', name: 'Deploy button click + smile', shotSizes: ['close', 'medium'], duration: '3-5s', kind: 'emotional', tags: ['founder', 'ship'], notes: 'Show terminal then face reaction.' },
            { id: 'metrics-dashboard-lean-back', name: 'Metrics dashboard, lean back', shotSizes: ['medium'], duration: '4-7s', kind: 'emotional', tags: ['founder', 'metrics'] },
            { id: 'phone-signup-notification', name: 'Phone notification — new signup', shotSizes: ['close'], duration: '2-4s', kind: 'detail', tags: ['founder', 'win'] },
            { id: 'first-revenue-stripe', name: 'First Stripe payment notification', shotSizes: ['close'], duration: '3-5s', kind: 'emotional', tags: ['founder', 'win', 'startup'] },
            { id: 'closing-laptop-eod', name: 'Closing laptop, end of day', shotSizes: ['close', 'medium'], duration: '3-5s', kind: 'emotional', tags: ['founder', 'lifestyle'] },
          ],
        },
        {
          id: 'calls-and-meetings',
          name: 'Calls & Meetings',
          shots: [
            { id: 'pacing-on-call-earbuds', name: 'Pacing on a call, wireless earbuds', shotSizes: ['medium', 'wide'], duration: '4-8s', kind: 'illustrative', tags: ['founder', 'calls'] },
            { id: 'zoom-call-screen-faces', name: 'Zoom call grid on screen', shotSizes: ['medium'], duration: '3-5s', kind: 'illustrative', tags: ['founder', 'calls'] },
            { id: 'calendar-full-of-meetings', name: 'Calendar full of meetings on screen', shotSizes: ['close', 'medium'], duration: '3-5s', kind: 'detail', tags: ['founder', 'time'] },
            { id: 'slack-inbox-clearing', name: 'Clearing Slack / X inbox fast', shotSizes: ['close'], duration: '4-6s', kind: 'illustrative', tags: ['founder', 'comms'] },
            { id: 'user-research-printouts', name: 'Printed user research on table', shotSizes: ['close', 'medium'], duration: '4-7s', kind: 'detail', tags: ['founder', 'research'] },
          ],
        },
        {
          id: 'founder-lifestyle',
          name: 'Founder Lifestyle',
          shots: [
            { id: 'walking-coffee-shop-laptop-bag', name: 'Walking to coffee shop with laptop bag', shotSizes: ['medium', 'wide'], duration: '5-10s', kind: 'establishing', tags: ['founder', 'lifestyle'] },
            { id: 'coffee-shop-work-session-wide', name: 'Coffee shop work session, wide', shotSizes: ['wide'], duration: '5-10s', kind: 'establishing', tags: ['founder', 'cafe'] },
            { id: 'coffee-laptop-morning', name: 'Coffee + laptop, morning, wide', shotSizes: ['medium', 'wide'], duration: '4-8s', kind: 'establishing', tags: ['founder', 'morning'] },
            { id: 'desk-stretch-break', name: 'Stretching at desk between sprints', shotSizes: ['medium'], duration: '3-6s', kind: 'illustrative', tags: ['founder', 'health'] },
            { id: 'reading-paperback-break', name: 'Reading paperback / Kindle on break', shotSizes: ['close', 'medium'], duration: '4-7s', kind: 'detail', tags: ['founder', 'reading'] },
          ],
        },
      ],
    },
    {
      id: 'startup-day-one',
      name: 'Startup — Day 1 Series',
      icon: 'flag',
      color: '#f97316',
      description: 'Specific shots for the "Building my startup, Day 1" launch series.',
      types: [
        {
          id: 'origin',
          name: 'Origin',
          shots: [
            { id: 'blank-notebook-day-one', name: 'Blank notebook open — "Day 1"', shotSizes: ['close', 'medium'], duration: '3-5s', kind: 'emotional', tags: ['startup', 'series', 'origin'], series: 'startup-day-one', notes: 'Slow push-in works great here.' },
            { id: 'writing-day-one-header', name: 'Writing "Day 1: Building [name]"', shotSizes: ['close'], duration: '4-7s', kind: 'detail', tags: ['startup', 'series'], series: 'startup-day-one' },
            { id: 'logo-sketch-first', name: 'First logo sketch attempt, paper', shotSizes: ['close'], duration: '4-6s', kind: 'detail', tags: ['startup', 'brand'], series: 'startup-day-one' },
            { id: 'domain-registration-screen', name: 'Domain registration on screen', shotSizes: ['close', 'medium'], duration: '3-5s', kind: 'detail', tags: ['startup', 'launch'], series: 'startup-day-one' },
            { id: 'first-commit-terminal', name: 'First commit in terminal', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['startup', 'code'], series: 'startup-day-one', notes: 'Frame the timestamp.' },
            { id: 'first-stripe-account', name: 'First Stripe account dashboard', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['startup', 'money'], series: 'startup-day-one' },
            { id: 'first-user-list-stickies', name: 'First-user list — sticky notes wall', shotSizes: ['medium', 'wide'], duration: '4-7s', kind: 'illustrative', tags: ['startup', 'users'], series: 'startup-day-one' },
            { id: 'talking-head-im-building', name: 'Talking head — "I am building X"', shotSizes: ['medium'], duration: '6-12s', kind: 'emotional', tags: ['startup', 'face'], series: 'startup-day-one', notes: 'Anchor shot for series openers.' },
            { id: 'calendar-first-user-call', name: 'Calendar — first user call booked', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['startup', 'users'], series: 'startup-day-one' },
            { id: 'we-are-live-toast', name: '"We are live" coffee toast', shotSizes: ['medium', 'wide'], duration: '4-6s', kind: 'emotional', tags: ['startup', 'launch'], series: 'startup-day-one' },
          ],
        },
      ],
    },
    {
      id: 'gym',
      name: 'Gym & Fitness',
      icon: 'dumbbell',
      color: '#ef4444',
      description: 'Lifting, conditioning, the in-between moments.',
      types: [
        {
          id: 'arrival',
          name: 'Arrival',
          shots: [
            { id: 'walking-into-gym-pov', name: 'Walking into gym, POV', shotSizes: ['wide'], duration: '4-7s', kind: 'establishing', tags: ['gym'] },
            { id: 'earbuds-mirror', name: 'Putting earbuds in by mirror', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['gym'] },
            { id: 'gym-bag-bench-throw', name: 'Gym bag thrown on bench', shotSizes: ['medium'], duration: '2-4s', kind: 'detail', tags: ['gym'] },
          ],
        },
        {
          id: 'lifts',
          name: 'Lifts',
          shots: [
            { id: 'plates-loading-barbell', name: 'Loading plates on barbell', shotSizes: ['close', 'medium'], duration: '4-7s', kind: 'detail', tags: ['gym', 'strength'] },
            { id: 'bench-press-setup-wide', name: 'Bench press setup, wide', shotSizes: ['wide'], duration: '5-8s', kind: 'establishing', tags: ['gym', 'strength'] },
            { id: 'squat-rep-side-profile', name: 'Squat rep, side profile', shotSizes: ['medium', 'wide'], duration: '4-7s', kind: 'illustrative', tags: ['gym', 'strength'] },
            { id: 'deadlift-grip-chalk', name: 'Deadlift grip + chalk, close', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['gym', 'strength'] },
            { id: 'pullup-rep-side', name: 'Pull-up rep, side', shotSizes: ['medium'], duration: '4-6s', kind: 'illustrative', tags: ['gym', 'strength'] },
          ],
        },
        {
          id: 'conditioning',
          name: 'Conditioning',
          shots: [
            { id: 'rowing-machine-wide', name: 'Rowing machine, wide', shotSizes: ['wide'], duration: '4-8s', kind: 'illustrative', tags: ['gym', 'cardio'] },
            { id: 'treadmill-side-profile', name: 'Treadmill, side profile', shotSizes: ['medium', 'wide'], duration: '4-8s', kind: 'illustrative', tags: ['gym', 'cardio'] },
          ],
        },
        {
          id: 'in-between',
          name: 'In-Between',
          shots: [
            { id: 'water-bottle-drink', name: 'Water bottle drink between sets', shotSizes: ['close', 'medium'], duration: '3-5s', kind: 'detail', tags: ['gym'] },
            { id: 'sweat-towel-wipe', name: 'Towel sweat wipe, close', shotSizes: ['close'], duration: '2-4s', kind: 'detail', tags: ['gym'] },
            { id: 'phone-playlist-rest', name: 'Phone playlist scroll mid-rest', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['gym', 'music'] },
            { id: 'post-workout-stretch', name: 'Stretching post-workout', shotSizes: ['medium', 'wide'], duration: '4-7s', kind: 'illustrative', tags: ['gym', 'health'] },
            { id: 'walking-out-of-gym-sunset', name: 'Walking out of gym at sunset', shotSizes: ['wide'], duration: '5-10s', kind: 'establishing', tags: ['gym', 'lifestyle'] },
          ],
        },
      ],
    },
    {
      id: 'swim',
      name: 'Swimming',
      icon: 'wave',
      color: '#06b6d4',
      description: 'Pool sessions. Calm, clean, blue.',
      types: [
        {
          id: 'pre-swim',
          name: 'Pre-Swim',
          shots: [
            { id: 'goggles-cap-mirror', name: 'Goggles + cap, mirror close-up', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['swim'] },
            { id: 'walking-poolside-wide', name: 'Walking poolside, wide', shotSizes: ['wide'], duration: '5-8s', kind: 'establishing', tags: ['swim'] },
          ],
        },
        {
          id: 'in-water',
          name: 'In Water',
          shots: [
            { id: 'diving-in-splash', name: 'Diving in, water splash', shotSizes: ['medium', 'wide'], duration: '3-5s', kind: 'emotional', tags: ['swim'], notes: 'Slow-mo if you can.' },
            { id: 'underwater-stroke-side', name: 'Underwater stroke, side close', shotSizes: ['close', 'medium'], duration: '4-7s', kind: 'illustrative', tags: ['swim'], notes: 'Needs waterproof rig.' },
            { id: 'lap-flip-turn-wide', name: 'Lap flip-turn, wide', shotSizes: ['wide'], duration: '3-5s', kind: 'illustrative', tags: ['swim'] },
          ],
        },
        {
          id: 'post-swim',
          name: 'Post-Swim',
          shots: [
            { id: 'pool-edge-pullout', name: 'Pulling out of pool, hands on edge', shotSizes: ['medium'], duration: '3-5s', kind: 'detail', tags: ['swim'] },
            { id: 'towel-dry-off', name: 'Towel dry-off, close', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['swim'] },
            { id: 'locker-room-flipflops', name: 'Locker room flip-flops walk', shotSizes: ['close', 'medium'], duration: '3-5s', kind: 'detail', tags: ['swim'] },
          ],
        },
      ],
    },
    {
      id: 'college',
      name: 'College',
      icon: 'cap',
      color: '#22c55e',
      description: 'Campus, lectures, study sessions, the student-life beats.',
      types: [
        {
          id: 'campus',
          name: 'Campus',
          shots: [
            { id: 'walking-through-campus-wide', name: 'Walking through campus, wide', shotSizes: ['wide'], duration: '5-10s', kind: 'establishing', tags: ['college'] },
            { id: 'stairs-up-to-building', name: 'Stairs up to building, side', shotSizes: ['medium', 'wide'], duration: '3-6s', kind: 'illustrative', tags: ['college'] },
            { id: 'bike-rack-lock', name: 'Bike rack lock / unlock', shotSizes: ['close', 'medium'], duration: '3-5s', kind: 'detail', tags: ['college'] },
            { id: 'sunset-on-quad-walking', name: 'Sunset on quad, walking', shotSizes: ['wide'], duration: '5-10s', kind: 'establishing', tags: ['college', 'golden-hour'] },
            { id: 'backpack-pickup-walk-away', name: 'Backpack pickup, walking away', shotSizes: ['medium'], duration: '3-5s', kind: 'illustrative', tags: ['college'] },
          ],
        },
        {
          id: 'study',
          name: 'Study',
          shots: [
            { id: 'notebook-laptop-lecture-hall', name: 'Notebook + laptop in lecture hall', shotSizes: ['medium', 'wide'], duration: '4-8s', kind: 'establishing', tags: ['college', 'lecture'] },
            { id: 'coffee-library-desk-overhead', name: 'Coffee on library desk, overhead', shotSizes: ['close', 'medium'], duration: '3-6s', kind: 'detail', tags: ['college', 'cafe'] },
            { id: 'highlighter-textbook', name: 'Highlighter on textbook, close', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['college', 'study'] },
            { id: 'writing-on-paper', name: 'Writing on paper, hand close', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['college', 'study'] },
            { id: 'looking-up-from-lecture-side', name: 'Looking up from lecture, side', shotSizes: ['medium'], duration: '3-5s', kind: 'emotional', tags: ['college'] },
            { id: 'group-study-table-wide', name: 'Group study around table, wide', shotSizes: ['wide'], duration: '5-8s', kind: 'establishing', tags: ['college', 'social'] },
            { id: 'library-stacks-browse', name: 'Library stacks browse, side', shotSizes: ['medium'], duration: '4-7s', kind: 'illustrative', tags: ['college', 'study'] },
          ],
        },
      ],
    },
    {
      id: 'personal-brand',
      name: 'Personal Brand',
      icon: 'spark',
      color: '#facc15',
      description: 'Behind-the-scenes of being a creator. The making-of for IG/X content.',
      types: [
        {
          id: 'recording',
          name: 'Recording',
          shots: [
            { id: 'phone-tripod-recording-self', name: 'Phone on tripod recording self', shotSizes: ['medium', 'wide'], duration: '4-7s', kind: 'illustrative', tags: ['creator', 'bts'] },
            { id: 'ring-light-setup-close', name: 'Ring light setup, close', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['creator', 'bts'] },
            { id: 'click-record-iphone', name: 'Clicking record on iPhone, close', shotSizes: ['close'], duration: '2-4s', kind: 'detail', tags: ['creator', 'bts'] },
            { id: 'second-camera-angle-setup', name: 'Setting up second camera angle', shotSizes: ['medium'], duration: '3-6s', kind: 'illustrative', tags: ['creator', 'bts'] },
            { id: 'mic-podcast-headphones', name: 'Mic + headphones podcast setup', shotSizes: ['medium'], duration: '3-6s', kind: 'establishing', tags: ['creator', 'audio'] },
          ],
        },
        {
          id: 'editing',
          name: 'Editing',
          shots: [
            { id: 'reviewing-footage-laptop', name: 'Reviewing footage on laptop', shotSizes: ['medium'], duration: '4-7s', kind: 'illustrative', tags: ['creator', 'edit'] },
            { id: 'editing-premiere-screen', name: 'Editing in Premiere / CapCut, screen', shotSizes: ['close', 'medium'], duration: '4-8s', kind: 'illustrative', tags: ['creator', 'edit'] },
            { id: 'camera-roll-scroll-phone', name: 'Camera roll scroll on phone', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['creator', 'edit'] },
          ],
        },
        {
          id: 'planning',
          name: 'Planning',
          shots: [
            { id: 'whiteboard-content-ideas', name: 'Whiteboard with content ideas', shotSizes: ['medium', 'wide'], duration: '4-7s', kind: 'illustrative', tags: ['creator', 'plan'] },
            { id: 'storyboarding-hooks-notebook', name: 'Storyboarding hooks in notebook', shotSizes: ['close'], duration: '4-7s', kind: 'detail', tags: ['creator', 'plan'] },
            { id: 'pen-on-page-hook-brainstorm', name: 'Pen-on-page hook brainstorm', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['creator', 'plan'] },
            { id: 'posts-pinned-to-wall', name: 'Pinned post print-outs on wall', shotSizes: ['medium', 'wide'], duration: '4-7s', kind: 'establishing', tags: ['creator', 'plan'] },
          ],
        },
        {
          id: 'distribution',
          name: 'Distribution',
          shots: [
            { id: 'reading-comments-phone', name: 'Reading comments on phone', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['creator', 'audience'] },
            { id: 'posting-from-phone-swipe', name: 'Posting from phone, finger swipe', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['creator', 'distribution'] },
            { id: 'analytics-dashboard-watch', name: 'Watching analytics dashboard', shotSizes: ['medium'], duration: '3-5s', kind: 'emotional', tags: ['creator', 'metrics'] },
          ],
        },
      ],
    },
    {
      id: 'lifestyle',
      name: 'Lifestyle / Daily',
      icon: 'sun',
      color: '#10b981',
      description: 'The connective tissue. Mornings, food, walks, sunsets — the human glue between work shots.',
      types: [
        {
          id: 'morning',
          name: 'Morning',
          shots: [
            { id: 'morning-alarm-phone', name: 'Morning alarm on phone', shotSizes: ['close'], duration: '2-4s', kind: 'detail', tags: ['morning', 'lifestyle'] },
            { id: 'coffee-pour-slowmo', name: 'Coffee pour, slow-mo close', shotSizes: ['close'], duration: '4-6s', kind: 'detail', tags: ['morning', 'cafe'] },
            { id: 'apartment-window-sunlight-wide', name: 'Apartment window sunlight, wide', shotSizes: ['wide'], duration: '4-7s', kind: 'establishing', tags: ['morning', 'lifestyle'] },
            { id: 'plant-watering-close', name: 'Plant watering, close', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['lifestyle'] },
          ],
        },
        {
          id: 'commute',
          name: 'Commute',
          shots: [
            { id: 'walking-to-transit-wide', name: 'Walking to subway / bus, wide', shotSizes: ['wide'], duration: '4-8s', kind: 'establishing', tags: ['commute', 'lifestyle'] },
            { id: 'earbuds-on-commute-side', name: 'Earbuds in on commute, side', shotSizes: ['medium'], duration: '3-5s', kind: 'illustrative', tags: ['commute', 'lifestyle'] },
            { id: 'apple-watch-glance', name: 'Apple Watch glance, close', shotSizes: ['close'], duration: '2-4s', kind: 'detail', tags: ['commute', 'lifestyle'] },
          ],
        },
        {
          id: 'food',
          name: 'Food',
          shots: [
            { id: 'cooking-chopping-veg', name: 'Chopping vegetables, close', shotSizes: ['close'], duration: '4-6s', kind: 'detail', tags: ['food', 'lifestyle'] },
            { id: 'plate-of-food-overhead', name: 'Plate of food, overhead', shotSizes: ['close', 'medium'], duration: '3-5s', kind: 'detail', tags: ['food'] },
          ],
        },
        {
          id: 'transitions',
          name: 'Transitions',
          shots: [
            { id: 'shoes-on-at-door', name: 'Putting shoes on at door, close', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['transition', 'lifestyle'] },
            { id: 'keys-in-lock', name: 'Keys in lock, close', shotSizes: ['close'], duration: '2-4s', kind: 'detail', tags: ['transition', 'lifestyle'] },
            { id: 'tying-shoelaces', name: 'Tying shoelaces, close', shotSizes: ['close'], duration: '3-5s', kind: 'detail', tags: ['transition', 'lifestyle'] },
            { id: 'sunset-city-lights-wide', name: 'Sunset / city lights, wide', shotSizes: ['wide'], duration: '5-10s', kind: 'establishing', tags: ['lifestyle', 'golden-hour'] },
          ],
        },
        {
          id: 'evening',
          name: 'Evening',
          shots: [
            { id: 'journal-on-couch-evening', name: 'Journaling on couch, evening light', shotSizes: ['close', 'medium'], duration: '4-7s', kind: 'detail', tags: ['evening', 'lifestyle', 'reflection'] },
            { id: 'apartment-lights-on-wide', name: 'Apartment lights on, wide interior', shotSizes: ['wide'], duration: '4-7s', kind: 'establishing', tags: ['evening', 'lifestyle'] },
          ],
        },
      ],
    },
  ],
}

export function countShots(catalog: BrollCatalog): number {
  let n = 0
  for (const c of catalog.categories) for (const t of c.types) n += t.shots.length
  return n
}
