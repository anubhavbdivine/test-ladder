'use strict';

/* =========================================================
   THE LADDER
   Local-first personal tracker.

   Run XP is derived from daily completion records, not clicks.
   Closed days are checked even when the app was not opened.
   ========================================================= */

const STORAGE_KEY = 'ladder:complete:v3';

const RULES = Object.freeze({
  taskXp: 10,
  taskCap: 100,
  ratio: 0.60,
  minimumTasks: 3,
  secureBonus: 30,
  perfectBonus: 20,
  firstLevelCost: 100,
  levelCostIncrease: 25
});

const LEVEL_NAMES = [
  'Rookie',
  'Builder',
  'Contender',
  'Operator',
  'Specialist',
  'Veteran',
  'Elite',
  'Master',
  'Legend'
];

const DAY_TYPES = ['weekday', 'saturday', 'sunday'];

const $ = id => document.getElementById(id);

function clone(value){
  return JSON.parse(JSON.stringify(value));
}

function make(tag, className, text){
  const element = document.createElement(tag);

  if(className){
    element.className = className;
  }

  if(text !== undefined){
    element.textContent = text;
  }

  return element;
}

function makeButton(text, className, handler){
  const button = make('button', className, text);
  button.type = 'button';

  if(handler){
    button.addEventListener('click', handler);
  }

  return button;
}

function uid(){
  if(globalThis.crypto && crypto.randomUUID){
    return crypto.randomUUID();
  }

  return Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10);
}

function todayKey(){
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function dayTypeForDate(key){
  const day = new Date(key + 'T12:00:00').getDay();

  if(day === 0) return 'sunday';
  if(day === 6) return 'saturday';

  return 'weekday';
}

function dayNumber(key){
  const [year, month, day] = key.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function dayKeyFromNumber(number){
  return new Date(number * 86400000).toISOString().slice(0, 10);
}

function validDateKey(key){
  if(typeof key !== 'string') return false;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;

  const number = dayNumber(key);

  return Number.isFinite(number) &&
    dayKeyFromNumber(number) === key &&
    key >= '2000-01-01' &&
    key <= '2200-12-31';
}

function plainText(value){
  const documentValue = new DOMParser().parseFromString(
    String(value || ''),
    'text/html'
  );

  return documentValue.body.textContent || '';
}

/* ---------------- Default training program ---------------- */

const BASE_GROUPS = [
  {
    name: 'Push / Pull',
    items: [
      [
        'Chest Press',
        '10–12',
        '15–20 kg',
        'Controlled tempo. Use a comfortable range and load.'
      ],
      [
        'Lat Pulldown',
        '10–12',
        '20–25 kg',
        'Avoid swinging. Keep the movement controlled.'
      ],
      [
        'Cable Row',
        '10–12',
        '20–25 kg',
        'Keep a comfortable neutral spine; avoid rounding under load.'
      ],
      [
        'Shoulder Press',
        '10–12',
        '10–15 kg',
        'Start light. Stop or modify if the shoulder is uncomfortable.'
      ],
      [
        'Lateral Raise',
        '12–15',
        '3–5 kg/hand',
        'Slight bend in the elbow. No swinging.'
      ]
    ]
  },
  {
    name: 'Arms',
    items: [
      [
        'Triceps Pushdown',
        '10–12',
        '7.5–10 kg',
        'Keep elbows comfortably near your sides.'
      ],
      [
        'Bicep Curl',
        '10–12',
        '5–7.5 kg/hand',
        'Use controlled reps without leaning backward.'
      ],
      [
        'Hammer Curl',
        '10–12',
        '5–7.5 kg/hand',
        'Neutral grip and a slow lowering phase.'
      ],
      [
        'Reverse Curl',
        '10–12',
        '2.5–5 kg/hand',
        'Use small loads and respect wrist or elbow discomfort.'
      ],
      [
        'Concentration Curl',
        '10–12',
        '5–7.5 kg/hand',
        'Seated, elbow supported, no jerking.'
      ]
    ]
  },
  {
    name: 'Core & carry',
    items: [
      [
        'Farmer Carry',
        '20–30 sec',
        '7.5–10 kg/hand',
        'Walk tall with a comfortable load. Stop if symptoms increase.'
      ],
      [
        'Pallof Press',
        '10–12/side',
        '10–15 kg',
        'Resist rotation without holding your breath.'
      ],
      [
        'Bird Dog',
        '8–10/side',
        'Bodyweight',
        'Reach slowly and keep your trunk controlled.'
      ],
      [
        'Dead Bug',
        '8–10/side',
        'Bodyweight',
        'Use a range that lets you maintain comfortable trunk control.'
      ],
      [
        'Cat-Cow',
        '8–10 cycles',
        'Bodyweight',
        'Gentle, breath-led movement. Stay in a comfortable range.'
      ]
    ]
  }
];

const PHASE_DEFINITIONS = [
  {
    title: 'Foundation',
    tag: 'Groove the pattern',
    rule:
      'Start with two sets and comfortable loads. The example weights are ' +
      'starting references, not requirements. Prioritize clean technique, ' +
      'comfortable range, and recovery over adding weight.'
  },
  {
    title: 'Double progression',
    tag: 'Reps first, then load',
    rule:
      'When both sets reach the top of the rep range with about two good ' +
      'reps left in reserve, add the smallest practical load increase and ' +
      'return to the lower end of the range. For core exercises, improve ' +
      'control before increasing difficulty.'
  },
  {
    title: 'Add volume',
    tag: 'A third set on the big lifts',
    rule:
      'If recovery and technique are good, add a third set to chest press, ' +
      'lat pulldown, and cable row. Other movements stay at two sets. ' +
      'Continue progressing gradually rather than forcing weekly increases.'
  },
  {
    title: 'Intensity',
    tag: 'More focused working sets',
    rule:
      'Keep adequate rest on compound movements, typically 90–120 seconds ' +
      'or more if needed. Isolation work can use shorter rests if technique ' +
      'holds up. Do not trade comfortable movement for heavier numbers.'
  },
  {
    title: 'Peak',
    tag: 'Your strongest sustainable work',
    rule:
      'Use your heaviest sustainable working loads while leaving about ' +
      'two good reps in reserve. This is not a max-out. Hold loads steady ' +
      'or reduce training when sleep, exams, pain, or recovery require it.'
  },
  {
    title: 'Deload & rebuild',
    tag: 'Week 21 lighter, then rebuild',
    rule:
      'Week 21: reduce working loads by roughly 40% and use two comfortable ' +
      'sets. Weeks 22–24: gradually rebuild toward previous working loads. ' +
      'Do not force a return to old numbers if recovery or symptoms say otherwise.'
  }
];

function buildDefaultPhases(){
  const compounds = new Set([
    'Chest Press', 'Lat Pulldown', 'Cable Row'
  ]);

  const mobility = new Set([
    'Bird Dog', 'Dead Bug', 'Cat-Cow'
  ]);

  return PHASE_DEFINITIONS.map((definition, phaseIndex) => {
    const groups = BASE_GROUPS.map(group => ({
      name: group.name,

      items: group.items.map(base => {
        const [name, originalReps, originalWeight, note] = base;

        let sets = '2';
        let reps = originalReps;
        let weight = originalWeight;

        if(phaseIndex >= 2 && compounds.has(name)){
          sets = '3';
        }

        if(phaseIndex === 1 && !mobility.has(name)){
          weight = 'Current load → smallest increase';
        }

        if(phaseIndex >= 2 && !mobility.has(name)){
          weight = 'Current comfortable working load';
        }

        if(phaseIndex === 3 && compounds.has(name)){
          reps = '8–10';
        }

        if(phaseIndex === 4 && compounds.has(name)){
          reps = '6–8';
          weight = 'Heaviest clean working load';
        }

        if(name === 'Farmer Carry'){
          reps = [
            '20–30 sec',
            '30–40 sec',
            '40–50 sec',
            '40–60 sec',
            'Up to 60 sec',
            'Comfortable duration'
          ][phaseIndex];
        }

        if(name === 'Bird Dog' || name === 'Dead Bug'){
          reps = [
            '8–10/side',
            '10–12/side',
            '10–12/side',
            '12–15/side',
            '12–15/side',
            'Comfortable range'
          ][phaseIndex];
        }

        if(name === 'Cat-Cow'){
          reps = '8–12 comfortable cycles';
        }

        if(phaseIndex === 5){
          weight = mobility.has(name)
            ? 'Bodyweight'
            : 'Gradually rebuild after the deload';

          if(compounds.has(name)){
            reps = '8–12';
          }
        }

        return { id: uid(), name, sets, reps, weight, note };
      })
    }));

    return {
      title: definition.title,
      tag: definition.tag,
      rule: definition.rule,
      groups
    };
  });
}

/* ---------------- Default daily checklists ---------------- */

function task(id, time, label, sub, reminderTime){
  return {
    id,
    time,
    label,
    sub: sub || '',
    reminderTime: reminderTime || '09:00',
    reminderOn: false
  };
}

function buildDefaultChecklists(){
  return {
    weekday: [
      task('wake', '7:00–7:20 AM', 'Wake up',
        'Water, sunlight, no phone', '07:00'),

      task('mobility', '7:20–8:00 AM', 'Stretching, mobility, pranayama',
        'Comfortable movement and back care', '07:20'),

      task('gym', '8:00–9:00 AM', 'Gym or planned recovery',
        'Follow your training and recovery schedule', '08:00'),

      task('breakfast', '9:00–9:30 AM', 'Breakfast', '', '09:00'),

      task('college', '10:00 AM–4:00 PM', 'College',
        'Ask one question today', '10:00'),

      task('instagram', '4:00–4:30 PM', 'Instagram break',
        'A timed mental reset', '16:00'),

      task('english', '4:30–5:00 PM', 'Read English aloud',
        'Reading or TED shadowing', '16:30'),

      task('snacks', '5:00 PM', 'Snacks', '', '17:00'),

      task('analytics', '6:30–8:00 PM', 'HR analytics',
        'Python, Power BI, or your dashboard project', '18:30'),

      task('placement', '8:00–9:00 PM', 'HR placement block',
        'Interview questions, GD, resume, or case studies', '20:00'),

      task('dinner', '9:00 PM', 'Dinner', '', '21:00'),

      task('fun', '10:00–11:00 PM', 'Anime, manga, or another fun break',
        'Recharge without guilt', '22:00'),

      task('reading', '11:00 PM', 'Reading block',
        'Adjust the duration so you still get enough sleep', '23:00'),

      task('sleep', 'Before midnight', 'Begin bedtime routine',
        'Wind down and protect your sleep', '23:30')
    ],

    saturday: [
      task('art', 'Morning', 'Digital art',
        'Learn something creative', '09:00'),

      task('analytics-proj', 'Morning', 'Analytics project', '', '09:30'),

      task('gym', 'Afternoon', 'Gym or planned recovery', '', '15:00'),

      task('yt', 'Afternoon', 'Interviews and confidence building',
        'Watch intentionally and take a useful note', '15:30'),

      task('news', 'Evening', 'Current affairs catch-up',
        'Review the week', '18:00'),

      task('movie', 'Night', 'Movie or another relaxing activity',
        'Recharge', '20:00')
    ],

    sunday: [
      task('selfcare', 'Morning', 'Self-care',
        'Hair care, scalp massage, or another useful ritual', '09:00'),

      task('chores', 'Morning', 'Laundry and room cleaning', '', '09:30'),

      task('art', 'Morning', 'Digital art', '', '10:00'),

      task('planning', 'Morning', 'Weekly planning',
        'Choose priorities and plan recovery', '10:30'),

      task('analytics-proj', 'Afternoon', 'Analytics project', '', '15:00'),

      task('yt', 'Afternoon', 'Interviews and confidence building',
        '', '15:30'),

      task('movie', 'Night', 'Movie or downtime', '', '20:00'),

      task('sleep-early', 'Night', 'Sleep early',
        'Set up a good Monday', '22:00')
    ]
  };
}

/* ---------------- State and migration ---------------- */

function freshState(){
  return {
    version: 3,
    startedOn: todayKey(),
    legacyXp: 0,
    theme: 'playful',
    week: 1,
    phases: buildDefaultPhases(),
    checklists: buildDefaultChecklists(),
    days: {},
    logs: [],
    firedReminders: {}
  };
}

function readOld(key){
  try{
    return JSON.parse(localStorage.getItem(key) || 'null');
  }catch(error){
    return null;
  }
}

function migrateOldData(state){
  const oldGame = readOld('game:stats');

  if(oldGame){
    state.legacyXp = Math.max(0, Number(oldGame.xp) || 0);
  }

  const oldChecklists = readOld('custom:checklists');

  if(oldChecklists){
    DAY_TYPES.forEach(type => {
      const list = oldChecklists[type];

      if(!Array.isArray(list)) return;

      state.checklists[type] = list.map(old => ({
        id: String(old.id || uid()),
        time: String(old.time || 'Anytime'),
        label: String(old.label || 'Task'),
        sub: String(old.sub || ''),
        reminderTime: /^\d{2}:\d{2}$/.test(old.reminderTime || '')
          ? old.reminderTime
          : '09:00',
        reminderOn: Boolean(old.reminder?.on)
      }));
    });
  }

  const oldPhases = readOld('custom:phases');

  if(Array.isArray(oldPhases) && oldPhases.length === 6){
    try{
      state.phases = oldPhases.map((phase, index) => ({
        title: String(phase.title || PHASE_DEFINITIONS[index].title),
        tag: String(phase.tag || ''),
        rule: plainText(phase.rule || PHASE_DEFINITIONS[index].rule),

        groups: phase.rows.map(group => ({
          name: String(group.group || 'Exercises'),

          items: group.items.map(row => ({
            id: uid(),
            name: String(row[0] || 'Exercise'),
            sets: String(row[1] || '2'),
            reps: String(row[2] || ''),
            weight: String(row[3] || ''),
            note: String(row[4] || '')
          }))
        }))
      }));
    }catch(error){
      state.phases = buildDefaultPhases();
    }
  }

  const oldLogs = readOld('workout-log:entries');

  if(Array.isArray(oldLogs)){
    state.logs = oldLogs
      .filter(entry =>
        Number.isFinite(Number(entry.weight)) &&
        Number(entry.weight) >= 0
      )
      .map(entry => ({
        id: String(entry.id || uid()),
        exercise: String(entry.exercise || 'Exercise'),
        weight: Number(entry.weight),
        reps: String(entry.reps || ''),
        date: String(entry.date || ''),
        createdAt: null
      }));
  }

  try{
    if(localStorage.getItem('ladder-theme') === 'calm'){
      state.theme = 'calm';
    }

    const oldWeek = Number(localStorage.getItem('ladder:currentWeek'));

    if(Number.isInteger(oldWeek) && oldWeek >= 1 && oldWeek <= 24){
      state.week = oldWeek;
    }
  }catch(error){}

  const type = dayTypeForDate(todayKey());
  const oldTicks = readOld('checklist:' + todayKey() + ':' + type);

  if(oldTicks && typeof oldTicks === 'object'){
    const tasks = state.checklists[type];

    state.days[todayKey()] = {
      total: tasks.length,
      doneIds: tasks.filter(item => oldTicks[item.id]).map(item => item.id)
    };
  }

  return state;
}

function isText(value){
  return typeof value === 'string' && value.length <= 20000;
}

function validState(value){
  if(!value || value.version !== 3) return false;

  if(!validDateKey(value.startedOn)) return false;
  if(value.startedOn > todayKey()) return false;

  if(!Number.isFinite(value.legacyXp) || value.legacyXp < 0){
    return false;
  }

  if(value.legacyXp > 1000000000) return false;

  if(!Number.isInteger(value.week) || value.week < 1 || value.week > 24){
    return false;
  }

  if(!['playful', 'calm'].includes(value.theme)) return false;

  if(!value.checklists || typeof value.checklists !== 'object'){
    return false;
  }

  for(const type of DAY_TYPES){
    const list = value.checklists[type];

    if(!Array.isArray(list) || list.length > 500) return false;

    const ids = new Set();

    for(const item of list){
      if(!item || !isText(item.id) || !item.id || ids.has(item.id)){
        return false;
      }

      ids.add(item.id);

      if(!isText(item.label) || !isText(item.time) || !isText(item.sub)){
        return false;
      }

      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.reminderTime)){
        return false;
      }

      if(typeof item.reminderOn !== 'boolean') return false;
    }
  }

  if(!Array.isArray(value.phases) || value.phases.length !== 6){
    return false;
  }

  for(const phase of value.phases){
    if(!phase || !isText(phase.title) || !isText(phase.tag) ||
       !isText(phase.rule) || !Array.isArray(phase.groups)){
      return false;
    }

    if(phase.groups.length > 100) return false;

    for(const group of phase.groups){
      if(!group || !isText(group.name) || !Array.isArray(group.items)){
        return false;
      }

      if(group.items.length > 500) return false;

      for(const item of group.items){
        if(!item) return false;

        for(const field of ['id', 'name', 'sets', 'reps', 'weight', 'note']){
          if(!isText(item[field])) return false;
        }
      }
    }
  }

  if(!value.days || typeof value.days !== 'object' ||
     Array.isArray(value.days)){
    return false;
  }

  for(const [key, day] of Object.entries(value.days)){
    if(!validDateKey(key) || key < value.startedOn || key > todayKey()){
      return false;
    }

    if(!day || !Number.isInteger(day.total) ||
       day.total < 0 || day.total > 500){
      return false;
    }

    if(!Array.isArray(day.doneIds) ||
       day.doneIds.length > 500 ||
       !day.doneIds.every(isText)){
      return false;
    }
  }

  if(!Array.isArray(value.logs) || value.logs.length > 100000){
    return false;
  }

  for(const log of value.logs){
    if(!log || !isText(log.id) || !isText(log.exercise) ||
       !isText(log.reps) || !isText(log.date)){
      return false;
    }

    if(!Number.isFinite(log.weight) || log.weight < 0 ||
       log.weight > 100000){
      return false;
    }

    if(log.createdAt !== null &&
       (!Number.isFinite(log.createdAt) || log.createdAt < 0 ||
        log.createdAt > 8640000000000000)){
      return false;
    }
  }

  if(!value.firedReminders ||
     typeof value.firedReminders !== 'object' ||
     Array.isArray(value.firedReminders)){
    return false;
  }

  for(const list of Object.values(value.firedReminders)){
    if(!Array.isArray(list) || !list.every(isText)) return false;
  }

  return true;
}

let bootWarning = '';

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);

    if(raw){
      const saved = JSON.parse(raw);

      if(validState(saved)){
        return saved;
      }

      throw new Error('Saved data failed validation.');
    }

    const migrated = migrateOldData(freshState());

    if(validState(migrated)){
      return migrated;
    }

    bootWarning =
      'Some older data could not be migrated. The old storage keys have ' +
      'not been deleted. This version is starting with its defaults.';

    return freshState();
  }catch(error){
    bootWarning =
      'Saved data could not be loaded, or browser storage is unavailable. ' +
      'If you have a backup, import it before making changes.';

    return freshState();
  }
}

let state = loadState();
let activeDate = todayKey();
let currentDayType = dayTypeForDate(activeDate);
let currentTab = 'checklist';
let editMode = false;
let toastTimer = null;
let editorSave = null;
let backupMode = false;

function storageWarning(message){
  const warning = $('storageWarning');
  warning.textContent = message;
  warning.hidden = !message;
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    if(!bootWarning){
      storageWarning('');
    }

    return true;
  }catch(error){
    storageWarning(
      'Your latest changes could not be saved. Browser storage may be ' +
      'blocked or full. Export a backup now and do not close the page ' +
      'until you have saved it.'
    );

    return false;
  }
}

/* ---------------- Daily ledger and XP ---------------- */

function reconcileToday(){
  const key = todayKey();
  const type = dayTypeForDate(key);
  const tasks = state.checklists[type];
  const validIds = new Set(tasks.map(item => item.id));

  const existing = state.days[key] || { total: 0, doneIds: [] };

  state.days[key] = {
    total: validIds.size,

    doneIds: [...new Set(existing.doneIds || [])]
      .filter(id => validIds.has(id))
  };
}

function targetFor(total){
  if(total <= 0) return 0;

  return Math.min(
    total,
    Math.max(RULES.minimumTasks, Math.ceil(total * RULES.ratio))
  );
}

function scoreDay(day){
  if(!day || day.total <= 0){
    return {
      total: 0,
      done: 0,
      target: 0,
      secured: false,
      perfect: false,
      xp: 0
    };
  }

  const total = day.total;
  const done = Math.min(total, new Set(day.doneIds).size);
  const target = targetFor(total);
  const secured = done >= target;
  const perfect = done === total;

  return {
    total,
    done,
    target,
    secured,
    perfect,

    xp:
      Math.min(RULES.taskCap, done * RULES.taskXp) +
      (secured ? RULES.secureBonus : 0) +
      (perfect ? RULES.perfectBonus : 0)
  };
}

function deriveGame(){
  const today = dayNumber(todayKey());
  const start = dayNumber(state.startedOn);

  let runXp = 0;
  let runDays = 0;
  let bestRun = 0;
  let missed = 0;
  let lifetimeXp = state.legacyXp;

  for(let number = start; number < today; number++){
    const score = scoreDay(state.days[dayKeyFromNumber(number)]);

    lifetimeXp += score.xp;
    runXp += score.xp;

    if(score.secured){
      missed = 0;
      runDays++;
      bestRun = Math.max(bestRun, runDays);
    }else{
      missed++;

      if(missed >= 2){
        runXp = 0;
        runDays = 0;
      }
    }
  }

  const missedBeforeToday = missed;
  const todayScore = scoreDay(state.days[todayKey()]);

  lifetimeXp += todayScore.xp;
  runXp += todayScore.xp;

  if(todayScore.secured){
    runDays++;
    bestRun = Math.max(bestRun, runDays);
    missed = 0;
  }

  return {
    runXp,
    runDays,
    bestRun,
    lifetimeXp,
    todayScore,
    missedBeforeToday,
    graceReady: missed === 0
  };
}

function levelInfo(xp){
  let level = 1;
  let intoLevel = Math.max(0, xp);
  let cost = RULES.firstLevelCost;

  while(intoLevel >= cost){
    intoLevel -= cost;
    level++;
    cost = RULES.firstLevelCost +
      (level - 1) * RULES.levelCostIncrease;
  }

  return {
    level,
    cost,
    intoLevel,
    remaining: cost - intoLevel,
    percent: Math.round(intoLevel / cost * 100),
    title: LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)]
  };
}

function ensureDate(){
  const key = todayKey();

  if(key === activeDate) return true;

  activeDate = key;
  currentDayType = dayTypeForDate(key);

  if($('editorDialog').open){
    $('editorDialog').close();
  }

  reconcileToday();
  saveState();
  renderAll();

  showToast('A new day has started. Your checklist is ready.');
  return false;
}

function commitTaskChange(before){
  saveState();
  renderDashboard();
  renderChecklist();

  const after = deriveGame();
  const messages = [];

  if(!before.todayScore.secured && after.todayScore.secured){
    messages.push('Day secured! +30 bonus XP');
  }

  if(!before.todayScore.perfect && after.todayScore.perfect){
    messages.push('Perfect day! +20 bonus XP');
  }

  const previousLevel = levelInfo(before.runXp).level;
  const nextLevel = levelInfo(after.runXp).level;

  if(nextLevel > previousLevel){
    messages.push('Level ' + nextLevel + ' unlocked');
  }

  if(messages.length){
    showToast(messages.join(' · '), true);
  }
}

/* ---------------- Theme and dashboard ---------------- */

function applyTheme(){
  const calm = state.theme === 'calm';

  document.body.classList.toggle('theme-calm', calm);
  $('themeToggle').textContent = calm ? '☀️ Playful' : '🌙 Calm';

  $('themeToggle').setAttribute(
    'aria-label',
    calm ? 'Switch to playful theme' : 'Switch to calm theme'
  );

  document.querySelector('meta[name="theme-color"]')
    .setAttribute('content', calm ? '#14181F' : '#FFF8EC');
}

function setMeter(meterId, fillId, percent){
  $(meterId).setAttribute('aria-valuenow', String(percent));
  $(fillId).style.width = percent + '%';
}

function renderDashboard(){
  const game = deriveGame();
  const level = levelInfo(game.runXp);
  const day = game.todayScore;

  $('levelNumber').textContent = level.level;
  $('levelTitle').textContent = level.title;

  $('runXpText').textContent =
    game.runXp.toLocaleString() + ' run XP';

  $('nextLevelText').textContent =
    level.remaining + ' to Level ' + (level.level + 1);

  $('runDaysText').textContent = game.runDays;
  $('bestRunText').textContent = game.bestRun;

  $('lifetimeText').textContent =
    game.lifetimeXp.toLocaleString();

  setMeter('levelMeter', 'levelFill', level.percent);

  const chip = $('graceChip');
  chip.classList.toggle('warning', !game.graceReady);

  if(day.secured){
    $('statusTitle').textContent = day.perfect
      ? 'Perfect day. Nicely done.'
      : 'Today is secured.';

    $('statusDescription').textContent =
      'Your run is safe for today. You have earned a little breathing ' +
      'room: one consecutive missed day is allowed.';

    chip.textContent = '🛡 Grace ready';
  }else if(game.missedBeforeToday >= 2){
    $('statusTitle').textContent = 'Fresh run. Same experience.';

    $('statusDescription').textContent =
      'Two consecutive days were missed, so the old run reset. ' +
      'Your lifetime XP, best run, and workout history remain. ' +
      'Secure today to begin rebuilding.';

    chip.textContent = '↻ Rebuilding';
  }else if(game.missedBeforeToday === 1){
    $('statusTitle').textContent = 'Your grace day has been used.';

    $('statusDescription').textContent =
      'Yesterday was missed. Secure today before local midnight to ' +
      'save your run. Otherwise, current run XP and run days reset.';

    chip.textContent = '⚠ Secure today';
  }else{
    $('statusTitle').textContent = 'One day at a time.';

    $('statusDescription').textContent =
      'Complete today’s goal to grow your run. One missed day is ' +
      'allowed; two in a row reset current run XP.';

    chip.textContent = '🛡 Grace ready';
  }

  $('goalText').textContent = day.total
    ? day.done + ' / ' + day.target + ' tasks · ' +
      (day.secured ? 'goal secured' : 'to secure today')
    : 'Add tasks to today’s checklist to begin';

  $('dailyXpText').textContent = day.xp + ' / 150 XP today';

  const goalPercent = day.target
    ? Math.min(100, Math.round(day.done / day.target * 100))
    : 0;

  setMeter('goalMeter', 'goalFill', goalPercent);

  renderTrail();
}

function renderTrail(){
  const container = $('weekTrail');
  container.replaceChildren();

  const today = dayNumber(todayKey());
  const start = dayNumber(state.startedOn);

  for(let number = today - 6; number <= today; number++){
    const key = dayKeyFromNumber(number);
    const score = scoreDay(state.days[key]);

    const isToday = number === today;
    const beforeStart = number < start;

    let className = 'trail-day';
    let symbol = '–';
    let description = 'Missed';

    if(beforeStart){
      className += ' neutral';
      symbol = '·';
      description = 'Before this game started';
    }else if(score.secured){
      className += ' secured';
      symbol = '✓';
      description = 'Day secured';
    }else if(isToday){
      symbol = '○';
      description = 'In progress';
    }

    if(isToday){
      className += ' today';
    }

    const item = make('div', className);
    item.title = key + ': ' + description;
    item.setAttribute('aria-label', key + ': ' + description);

    const label = new Date(key + 'T12:00:00')
      .toLocaleDateString(undefined, { weekday: 'short' });

    item.append(
      make('span', '', label),
      make('strong', '', symbol)
    );

    container.appendChild(item);
  }
}

/* ---------------- Checklist rendering ---------------- */

function renderChecklist(){
  const actualType = dayTypeForDate(todayKey());
  const isToday = currentDayType === actualType;
  const day = state.days[todayKey()];
  const doneIds = new Set(isToday ? day.doneIds : []);

  $('todayLabel').textContent = new Date().toLocaleDateString(
    undefined,
    { weekday: 'long', month: 'short', day: 'numeric' }
  );

  document.querySelectorAll('[data-day]').forEach(button => {
    const active = button.dataset.day === currentDayType;

    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  $('previewNote').textContent = isToday
    ? 'This is today’s list. Ticks earn XP and are saved for this date.'
    : 'Preview only: you can edit this schedule, but only the actual ' +
      'day’s checklist can be ticked or earn XP.';

  $('clearTicksButton').hidden = !isToday;

  const container = $('checklistTasks');
  container.replaceChildren();

  const tasks = state.checklists[currentDayType];

  if(!tasks.length){
    const empty = make('div', 'empty-state');

    empty.append(
      make('strong', '', 'Your list is empty'),
      make('span', '', 'Turn on Edit mode and add your first task.')
    );

    container.appendChild(empty);
  }

  let lastTime = null;

  tasks.forEach(item => {
    if(item.time !== lastTime){
      container.appendChild(make('p', 'time-label', item.time));
      lastTime = item.time;
    }

    const done = doneIds.has(item.id);
    const row = make('div', 'task-row' + (done ? ' done' : ''));

    const toggle = makeButton('', 'task-toggle', () => {
      if(!ensureDate()) return;
      if(currentDayType !== dayTypeForDate(todayKey()) || editMode) return;

      const before = deriveGame();
      const current = state.days[todayKey()];
      const ids = new Set(current.doneIds);

      if(ids.has(item.id)){
        ids.delete(item.id);
      }else{
        ids.add(item.id);
      }

      current.doneIds = [...ids];
      commitTaskChange(before);
    });

    toggle.disabled = !isToday || editMode;
    toggle.setAttribute('aria-pressed', String(done));
    toggle.setAttribute(
      'aria-label',
      (done ? 'Mark incomplete: ' : 'Complete: ') + item.label
    );

    const copy = make('span', 'task-copy');
    copy.appendChild(make('span', 'task-name', item.label));

    if(item.sub){
      copy.appendChild(make('span', 'task-sub', item.sub));
    }

    if(item.reminderOn){
      copy.appendChild(make(
        'span',
        'task-sub',
        '🔔 Reminder at ' + formatTime(item.reminderTime)
      ));
    }

    toggle.append(
      make('span', 'task-box', done ? '✓' : ''),
      copy
    );

    const tools = make('div', 'task-tools');

    const bell = makeButton(
      item.reminderOn ? '🔔' : '🔕',
      'icon-button' + (item.reminderOn ? ' reminder-on' : ''),
      async () => {
        if(!ensureDate()) return;

        item.reminderOn = !item.reminderOn;
        saveState();
        renderChecklist();

        if(item.reminderOn){
          if('Notification' in window &&
             Notification.permission === 'default'){
            await requestReminders();
          }else if(!('Notification' in window) ||
                   Notification.permission !== 'granted'){
            showToast('Notifications are unavailable or blocked.');
          }
        }
      }
    );

    bell.title = item.reminderOn
      ? 'Disable this reminder'
      : 'Enable reminder at ' + formatTime(item.reminderTime);

    bell.setAttribute('aria-label', bell.title);
    bell.setAttribute('aria-pressed', String(item.reminderOn));

    tools.appendChild(bell);

    if(editMode){
      const edit = makeButton('✏️', 'icon-button', () => {
        openTaskEditor(item);
      });

      edit.setAttribute('aria-label', 'Edit ' + item.label);

      const remove = makeButton('✕', 'icon-button danger-button', () => {
        if(!ensureDate()) return;
        if(!confirm('Remove "' + item.label + '" from this checklist?')) return;

        state.checklists[currentDayType] =
          state.checklists[currentDayType]
            .filter(taskItem => taskItem.id !== item.id);

        reconcileToday();
        saveState();
        renderAll();
      });

      remove.setAttribute('aria-label', 'Delete ' + item.label);
      tools.append(edit, remove);
    }

    row.append(toggle, tools);
    container.appendChild(row);
  });

  updateReminderBanner();
}

/* ---------------- Shared editor dialog ---------------- */

function createField(definition){
  const label = make(
    'label',
    definition.type === 'checkbox' ? 'checkbox-label' : ''
  );

  let input;

  if(definition.type === 'textarea'){
    input = document.createElement('textarea');
  }else{
    input = document.createElement('input');
    input.type = definition.type || 'text';
  }

  input.name = definition.name;

  if(definition.type === 'checkbox'){
    input.checked = Boolean(definition.value);
    label.append(input, document.createTextNode(definition.label));
  }else{
    input.value = definition.value || '';
    input.required = Boolean(definition.required);
    input.maxLength = definition.maxLength || 2000;

    label.append(
      make('span', '', definition.label),
      input
    );
  }

  return label;
}

function openEditor(title, description, fields, onSave){
  backupMode = false;
  editorSave = onSave;

  $('dialogTitle').textContent = title;
  $('dialogDescription').textContent = description;

  const container = $('editorFields');
  container.replaceChildren();

  fields.forEach(field => {
    container.appendChild(createField(field));
  });

  $('editorForm').querySelector('.dialog-actions').hidden = false;
  $('editorDialog').showModal();

  const firstInput = container.querySelector('input,textarea');

  if(firstInput){
    firstInput.focus();
  }
}

function closeEditor(){
  $('editorDialog').close();
  editorSave = null;
}

function openTaskEditor(existing = null){
  if(!ensureDate()) return;

  const type = currentDayType;

  const item = existing || {
    time: '',
    label: '',
    sub: '',
    reminderTime: '09:00',
    reminderOn: false
  };

  openEditor(
    existing ? 'Edit task' : 'Add task',

    'Changes affect this schedule only. Editing today’s list recalculates ' +
    'today’s goal and XP. Previous days stay unchanged.',

    [
      {
        name: 'label',
        label: 'Task name',
        value: item.label,
        required: true
      },
      {
        name: 'time',
        label: 'Displayed time, such as Morning or 4:30 PM',
        value: item.time,
        required: true
      },
      {
        name: 'sub',
        label: 'Description — optional',
        type: 'textarea',
        value: item.sub
      },
      {
        name: 'reminderTime',
        label: 'Reminder time — local time',
        type: 'time',
        value: item.reminderTime,
        required: true
      },
      {
        name: 'reminderOn',
        label: 'Enable reminder for this task',
        type: 'checkbox',
        value: item.reminderOn
      }
    ],

    values => {
      const label = values.get('label').trim();
      const time = values.get('time').trim();

      if(!label || !time){
        showToast('Please enter a task name and displayed time.');
        return false;
      }

      const result = {
        id: existing ? existing.id : uid(),
        label,
        time,
        sub: values.get('sub').trim(),
        reminderTime: values.get('reminderTime'),
        reminderOn: values.get('reminderOn') === 'on'
      };

      if(existing){
        const index = state.checklists[type]
          .findIndex(taskItem => taskItem.id === existing.id);

        if(index < 0) return false;
        state.checklists[type][index] = result;
      }else{
        state.checklists[type].push(result);
      }

      reconcileToday();
      saveState();
      renderAll();
      showToast('Checklist saved.');

      return true;
    }
  );
}

/* ---------------- Training program ---------------- */

function currentPhaseIndex(){
  return Math.floor((state.week - 1) / 4);
}

function renderProgram(){
  const phaseIndex = currentPhaseIndex();
  const phase = state.phases[phaseIndex];

  $('selectedWeekText').textContent =
    'Week ' + state.week + ' · Phase ' + (phaseIndex + 1);

  const weeks = $('weekPicker');
  weeks.replaceChildren();

  for(let week = 1; week <= 24; week++){
    const button = makeButton(
      String(week),
      week === state.week ? 'active' : '',
      () => {
        state.week = week;
        saveState();
        renderProgram();
      }
    );

    button.setAttribute('aria-label', 'View week ' + week);
    button.setAttribute('aria-pressed', String(week === state.week));

    weeks.appendChild(button);
  }

  const phases = $('phasePicker');
  phases.replaceChildren();

  state.phases.forEach((item, index) => {
    const button = makeButton(
      '',
      'phase-button' + (index === phaseIndex ? ' active' : ''),
      () => {
        state.week = index * 4 + 1;
        saveState();
        renderProgram();
      }
    );

    button.setAttribute('aria-pressed', String(index === phaseIndex));

    button.append(
      make(
        'span',
        '',
        'Weeks ' + (index * 4 + 1) + '–' + (index * 4 + 4)
      ),
      make('strong', '', item.title)
    );

    phases.appendChild(button);
  });

  $('phaseRule').textContent = phase.rule;

  if(state.week === 21){
    $('phaseRule').textContent +=
      ' Deload override for this week: use two comfortable sets and ' +
      'about 60% of your previous working load where appropriate.';
  }

  const container = $('programGroups');
  container.replaceChildren();

  phase.groups.forEach((group, groupIndex) => {
    const card = make('article', 'card exercise-group');
    const heading = make('div', 'group-heading');

    heading.appendChild(make('h3', '', group.name));

    if(editMode){
      heading.appendChild(makeButton(
        '+ Exercise',
        'button secondary',
        () => openExerciseEditor(phaseIndex, groupIndex)
      ));
    }

    card.appendChild(heading);

    if(!group.items.length){
      card.appendChild(make(
        'p',
        'muted small-text',
        'No exercises in this group.'
      ));
    }

    group.items.forEach(item => {
      const row = make('div', 'exercise-row');
      const top = make('div', 'exercise-top');

      top.appendChild(make('h4', 'exercise-name', item.name));

      if(editMode){
        const tools = make('div', 'task-tools');

        const edit = makeButton('✏️', 'icon-button', () => {
          openExerciseEditor(phaseIndex, groupIndex, item);
        });

        edit.setAttribute('aria-label', 'Edit ' + item.name);

        const remove = makeButton('✕', 'icon-button danger-button', () => {
          if(!confirm(
            'Remove "' + item.name + '" from this phase only?'
          )) return;

          group.items = group.items.filter(rowItem => rowItem.id !== item.id);

          saveState();
          renderProgram();
          refreshExerciseSelects();
        });

        remove.setAttribute('aria-label', 'Delete ' + item.name);
        tools.append(edit, remove);
        top.appendChild(tools);
      }

      const values = make('div', 'exercise-values');

      const sets = state.week === 21 ? '2' : item.sets;

      const weight = state.week === 21
        ? 'Deload: comfortable reduced load'
        : item.weight;

      values.append(
        make('span', '', 'Sets: ' + sets),
        make('span', '', 'Reps/time: ' + item.reps),
        make('span', '', 'Weight: ' + weight)
      );

      row.append(
        top,
        values,
        make('p', 'exercise-note', item.note)
      );

      card.appendChild(row);
    });

    container.appendChild(card);
  });
}

function openExerciseEditor(phaseIndex, groupIndex, existing = null){
  const item = existing || {
    name: '',
    sets: '2',
    reps: '10–12',
    weight: '',
    note: ''
  };

  openEditor(
    existing ? 'Edit exercise' : 'Add exercise',

    'Exercise changes apply to this phase only. Your workout history ' +
    'is not renamed or deleted. Week 21 uses the deload display override.',

    [
      {
        name: 'name',
        label: 'Exercise name',
        value: item.name,
        required: true
      },
      {
        name: 'sets',
        label: 'Sets',
        value: item.sets,
        required: true
      },
      {
        name: 'reps',
        label: 'Reps or duration',
        value: item.reps,
        required: true
      },
      {
        name: 'weight',
        label: 'Weight or load guidance',
        value: item.weight,
        required: true
      },
      {
        name: 'note',
        label: 'Technique note',
        type: 'textarea',
        value: item.note
      }
    ],

    values => {
      const name = values.get('name').trim();

      if(!name){
        showToast('Please enter an exercise name.');
        return false;
      }

      const result = {
        id: existing ? existing.id : uid(),
        name,
        sets: values.get('sets').trim(),
        reps: values.get('reps').trim(),
        weight: values.get('weight').trim(),
        note: values.get('note').trim()
      };

      const group = state.phases[phaseIndex].groups[groupIndex];

      if(existing){
        const index = group.items.findIndex(row => row.id === existing.id);
        if(index < 0) return false;

        group.items[index] = result;
      }else{
        group.items.push(result);
      }

      saveState();
      renderProgram();
      refreshExerciseSelects();
      showToast('Exercise saved.');

      return true;
    }
  );
}

/* ---------------- Workout logger ---------------- */

function allExerciseNames(){
  const names = new Set();

  state.phases.forEach(phase => {
    phase.groups.forEach(group => {
      group.items.forEach(item => {
        if(item.name.trim()){
          names.add(item.name);
        }
      });
    });
  });

  return [...names].sort((a, b) => a.localeCompare(b));
}

function setSelectOptions(select, names, includeAll = false){
  const previous = select.value;
  select.replaceChildren();

  if(includeAll){
    const option = make('option', '', 'All exercises');
    option.value = '';
    select.appendChild(option);
  }

  names.forEach(name => {
    const option = make('option', '', name);
    option.value = name;
    select.appendChild(option);
  });

  if(names.includes(previous) || (includeAll && previous === '')){
    select.value = previous;
  }
}

function refreshExerciseSelects(){
  const names = allExerciseNames();
  setSelectOptions($('logExercise'), names);

  const historyNames = [...new Set(
    state.logs.map(entry => entry.exercise)
  )].sort((a, b) => a.localeCompare(b));

  setSelectOptions($('historyFilter'), historyNames, true);

  $('logForm').querySelector('button[type="submit"]').disabled =
    names.length === 0;
}

function renderHistory(){
  $('logCount').textContent =
    state.logs.length + (state.logs.length === 1 ? ' entry' : ' entries');

  const filter = $('historyFilter').value;
  const container = $('historyList');

  container.replaceChildren();

  const entries = state.logs
    .filter(entry => !filter || entry.exercise === filter)
    .slice()
    .reverse();

  if(!entries.length){
    const empty = make('div', 'empty-state');

    empty.append(
      make('strong', '', 'Your next session starts the story.'),
      make('span', '', 'Save an exercise above to build your training history.')
    );

    container.appendChild(empty);
    return;
  }

  entries.forEach(entry => {
    const card = make('article', 'card history-entry');
    const content = make('div');

    const date = entry.createdAt !== null
      ? new Date(entry.createdAt).toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
      : entry.date;

    content.append(
      make('h3', '', entry.exercise),
      make(
        'div',
        'log-value',
        entry.weight + ' kg · ' + entry.reps
      ),
      make('p', '', date)
    );

    const remove = makeButton('✕', 'icon-button danger-button', () => {
      if(!confirm('Delete this workout entry?')) return;

      state.logs = state.logs.filter(log => log.id !== entry.id);

      saveState();
      refreshExerciseSelects();
      renderHistory();
    });

    remove.setAttribute('aria-label', 'Delete workout entry');

    card.append(content, remove);
    container.appendChild(card);
  });
}

/* ---------------- Best-effort reminders ---------------- */

function formatTime(value){
  const [hour, minute] = value.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';

  return (hour % 12 || 12) + ':' +
    String(minute).padStart(2, '0') + ' ' + period;
}

function updateReminderBanner(){
  const text = $('reminderText');
  const button = $('enableReminders');

  if(!('Notification' in window)){
    text.textContent =
      'This browser does not expose notifications here. ' +
      'The checklist works normally without them.';

    button.hidden = true;
    return;
  }

  if(Notification.permission === 'granted'){
    text.textContent =
      'Reminders enabled. Best-effort while this page is active; ' +
      'closed-app and background delivery are not guaranteed.';

    button.hidden = true;
  }else if(Notification.permission === 'denied'){
    text.textContent =
      'Notifications are blocked. You can change this in your browser’s ' +
      'site settings. The checklist works without reminders.';

    button.hidden = true;
  }else{
    text.textContent =
      'Optional reminders while this page is active. ' +
      'For dependable alarms, use your phone’s clock or calendar.';

    button.hidden = false;
  }
}

async function requestReminders(){
  if(!('Notification' in window)) return;

  try{
    await Notification.requestPermission();
  }catch(error){
    showToast('This browser could not enable notifications.');
  }

  updateReminderBanner();
}

let reminderCheckRunning = false;

async function checkReminders(){
  if(reminderCheckRunning) return;
  if(!('Notification' in window)) return;
  if(Notification.permission !== 'granted') return;

  ensureDate();
  reminderCheckRunning = true;

  try{
    const dateKey = todayKey();
    const now = new Date();

    const time =
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0');

    const type = dayTypeForDate(dateKey);
    const done = new Set(state.days[dateKey].doneIds);
    const fired = new Set(state.firedReminders[dateKey] || []);

    for(const item of state.checklists[type]){
      const reminderId = type + ':' + item.id;

      if(!item.reminderOn ||
         item.reminderTime !== time ||
         done.has(item.id) ||
         fired.has(reminderId)){
        continue;
      }

      const options = {
        body: item.sub || 'A small step for your daily routine.',
        icon: new URL('./icon.svg', location.href).href,
        tag: 'ladder-' + reminderId
      };

      try{
        let registration = null;

        if('serviceWorker' in navigator){
          registration = await navigator.serviceWorker.getRegistration();
        }

        if(registration && registration.active){
          await registration.showNotification(item.label, options);
        }else{
          new Notification(item.label, options);
        }

        fired.add(reminderId);
      }catch(error){
        console.warn('Reminder delivery was unavailable.', error);
      }
    }

    state.firedReminders[dateKey] = [...fired];

    // Old notification bookkeeping is not part of XP history.
    const cutoff = dayNumber(dateKey) - 8;

    Object.keys(state.firedReminders).forEach(key => {
      if(validDateKey(key) && dayNumber(key) < cutoff){
        delete state.firedReminders[key];
      }
    });

    saveState();
  }finally{
    reminderCheckRunning = false;
  }
}

/* ---------------- Backups ---------------- */

function exportBackup(){
  ensureDate();

  const payload = {
    app: 'The Ladder',
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    state
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'the-ladder-backup-' + todayKey() + '.json';

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showToast('Backup download requested. Keep the JSON file safe.');
}

function openBackupDialog(){
  backupMode = true;
  editorSave = null;

  $('dialogTitle').textContent = 'Your data, your backup';

  $('dialogDescription').textContent =
    'Everything is stored in this browser. Export a JSON backup before ' +
    'clearing browser data, changing devices, or replacing your progress.';

  const container = $('editorFields');
  container.replaceChildren();

  const actions = make('div', 'backup-actions');

  actions.append(
    makeButton('↓ Export backup', 'button primary', exportBackup),

    makeButton('↑ Import backup', 'button secondary', () => {
      $('importFile').click();
    }),

    make('p', 'muted small-text',
      'Import replaces this version’s current data; it does not merge it. ' +
      'Only import a backup you trust. This importer accepts backups ' +
      'exported by this complete version of The Ladder.')
  );

  container.appendChild(actions);

  $('editorForm').querySelector('.dialog-actions').hidden = true;
  $('editorDialog').showModal();
}

async function importBackup(file){
  if(!file) return;

  if(file.size > 15 * 1024 * 1024){
    showToast('That file is too large. Maximum backup size is 15 MB.');
    return;
  }

  try{
    const payload = JSON.parse(await file.text());

    if(payload.app !== 'The Ladder' ||
       payload.backupVersion !== 1 ||
       !validState(payload.state)){
      throw new Error('Invalid backup format');
    }

    if(!confirm(
      'Replace current progress with this backup? Export your current ' +
      'data first if you want to keep it.'
    )) return;

    state = clone(payload.state);
    activeDate = todayKey();
    currentDayType = dayTypeForDate(activeDate);

    bootWarning = '';
    storageWarning('');

    reconcileToday();
    const saved = saveState();

    closeEditor();
    renderAll();

    showToast(saved
      ? 'Backup restored.'
      : 'Backup loaded in memory, but browser storage could not save it.'
    );
  }catch(error){
    showToast(
      'Could not import this file. Use a valid backup from this version.'
    );
  }
}

/* ---------------- Toast and celebration ---------------- */

function celebrate(){
  if(state.theme === 'calm') return;

  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    return;
  }

  const container = $('confetti');
  const colors = ['#50B72B', '#1CB0F6', '#FFD160', '#FF7C7C', '#BA91F5'];

  for(let index = 0; index < 24; index++){
    const piece = make('div', 'confetti-piece');

    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = Math.random() * 0.3 + 's';
    piece.style.animationDuration = 2 + Math.random() + 's';

    container.appendChild(piece);
    setTimeout(() => piece.remove(), 4000);
  }
}

function showToast(message, celebration = false){
  const toast = $('toast');

  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 4200);

  if(celebration){
    celebrate();
  }
}

/* ---------------- Main rendering ---------------- */

function renderEditState(){
  $('editToggle').classList.toggle('is-on', editMode);
  $('editToggle').textContent = editMode ? '✓ Done editing' : '✏️ Edit';
  $('editToggle').setAttribute('aria-pressed', String(editMode));

  document.querySelectorAll('.edit-only').forEach(element => {
    element.hidden = !editMode;
  });
}

function renderTabs(){
  document.querySelectorAll('[data-tab]').forEach(button => {
    const active = button.dataset.tab === currentTab;

    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });

  ['checklist', 'program', 'logger'].forEach(tab => {
    $('view-' + tab).hidden = tab !== currentTab;
  });
}

function renderAll(){
  applyTheme();
  renderEditState();
  renderTabs();
  renderDashboard();
  renderChecklist();
  renderProgram();
  refreshExerciseSelects();
  renderHistory();
}

/* ---------------- Event handlers ---------------- */

$('themeToggle').addEventListener('click', () => {
  state.theme = state.theme === 'calm' ? 'playful' : 'calm';

  saveState();
  applyTheme();
});

$('editToggle').addEventListener('click', () => {
  if(!ensureDate()) return;

  editMode = !editMode;
  renderEditState();
  renderChecklist();
  renderProgram();

  if(editMode){
    showToast('Edit mode on. Finish editing before ticking tasks.');
  }
});

document.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => {
    ensureDate();
    currentTab = button.dataset.tab;
    renderTabs();
  });
});

document.querySelectorAll('[data-day]').forEach(button => {
  button.addEventListener('click', () => {
    ensureDate();
    currentDayType = button.dataset.day;
    renderChecklist();
  });
});

$('addTaskButton').addEventListener('click', () => {
  openTaskEditor();
});

$('clearTicksButton').addEventListener('click', () => {
  if(!ensureDate()) return;
  if(currentDayType !== dayTypeForDate(todayKey())) return;

  if(!confirm(
    'Clear today’s ticks? Today’s task XP and completion bonuses will ' +
    'also be removed.'
  )) return;

  state.days[todayKey()].doneIds = [];

  saveState();
  renderDashboard();
  renderChecklist();

  showToast('Today’s ticks cleared.');
});

$('resetChecklistButton').addEventListener('click', () => {
  if(!ensureDate()) return;

  if(!confirm(
    'Reset this schedule to its default tasks? Other schedules and ' +
    'past-day records will remain. Today’s goal and XP may change.'
  )) return;

  const defaults = buildDefaultChecklists();

  state.checklists[currentDayType] = defaults[currentDayType];

  reconcileToday();
  saveState();
  renderAll();

  showToast('This checklist was reset.');
});

$('resetProgramButton').addEventListener('click', () => {
  if(!confirm(
    'Reset the entire 24-week program? Custom exercise changes will be ' +
    'lost. Your workout history will remain.'
  )) return;

  state.phases = buildDefaultPhases();

  saveState();
  renderProgram();
  refreshExerciseSelects();

  showToast('Program reset. Workout history kept.');
});

$('editorForm').addEventListener('submit', event => {
  event.preventDefault();

  if(backupMode || !editorSave) return;
  if(!ensureDate()) return;

  const values = new FormData($('editorForm'));
  const result = editorSave(values);

  if(result !== false){
    closeEditor();
  }
});

$('closeDialog').addEventListener('click', closeEditor);
$('cancelDialog').addEventListener('click', closeEditor);

$('editorDialog').addEventListener('close', () => {
  editorSave = null;
  backupMode = false;
});

$('logForm').addEventListener('submit', event => {
  event.preventDefault();
  ensureDate();

  const exercise = $('logExercise').value;
  const weight = Number($('logWeight').value);
  const reps = $('logReps').value.trim();

  if(!exercise ||
     $('logWeight').value === '' ||
     !Number.isFinite(weight) ||
     weight < 0 ||
     weight > 2000 ||
     !reps){
    showToast('Choose an exercise and enter a valid weight and reps/time.');
    return;
  }

  state.logs.push({
    id: uid(),
    exercise,
    weight,
    reps,
    date: todayKey(),
    createdAt: Date.now()
  });

  const saved = saveState();

  $('logWeight').value = '';
  $('logReps').value = '';

  refreshExerciseSelects();
  renderHistory();

  showToast(saved
    ? 'Workout entry saved. Good work.'
    : 'Entry added, but not saved to browser storage. Export a backup.'
  );
});

$('historyFilter').addEventListener('change', renderHistory);

$('enableReminders').addEventListener('click', requestReminders);

$('backupButton').addEventListener('click', openBackupDialog);

$('importFile').addEventListener('change', async event => {
  await importBackup(event.target.files[0]);
  event.target.value = '';
});

/*
  If another tab changes progress, load its latest saved state.
  For best results, edit in one tab at a time.
*/
window.addEventListener('storage', event => {
  if(event.key !== STORAGE_KEY || !event.newValue) return;

  try{
    const incoming = JSON.parse(event.newValue);

    if(!validState(incoming)) return;

    state = incoming;
    activeDate = todayKey();

    if($('editorDialog').open){
      closeEditor();
      showToast('Progress changed in another tab. Please reopen your edit.');
    }

    reconcileToday();
    renderAll();
  }catch(error){}
});

window.addEventListener('focus', () => {
  ensureDate();
  updateReminderBanner();
  checkReminders();
});

document.addEventListener('visibilitychange', () => {
  if(!document.hidden){
    ensureDate();
    checkReminders();
  }
});

setInterval(ensureDate, 15000);
setInterval(checkReminders, 20000);

/* ---------------- Start the app ---------------- */

reconcileToday();
renderAll();

if(bootWarning){
  storageWarning(bootWarning);
}else{
  saveState();
}

checkReminders();

/* ---------------- Offline service worker ---------------- */

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(error => {
        console.warn('Offline support could not be registered.', error);
      });
  });
}