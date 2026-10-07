// Thai names for D&D 2024 core terms. Rules text (spells, features) stays in English from the SRD; keys follow the
// SRD's slugs so the build can check every class/species/background has a name here.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_TH: Record<Ability, { name: string; short: string; en: string }> = {
  str: { name: 'พละกำลัง', short: 'พลัง', en: 'Strength' },
  dex: { name: 'ความว่องไว', short: 'ว่องไว', en: 'Dexterity' },
  con: { name: 'ความอดทน', short: 'อดทน', en: 'Constitution' },
  int: { name: 'สติปัญญา', short: 'ปัญญา', en: 'Intelligence' },
  wis: { name: 'ความเฉลียวฉลาด', short: 'ฉลาด', en: 'Wisdom' },
  cha: { name: 'เสน่ห์', short: 'เสน่ห์', en: 'Charisma' },
};

export const SKILLS = {
  acrobatics: { th: 'กายกรรม', en: 'Acrobatics', ability: 'dex' },
  'animal-handling': { th: 'จัดการสัตว์', en: 'Animal Handling', ability: 'wis' },
  arcana: { th: 'ศาสตร์เวท', en: 'Arcana', ability: 'int' },
  athletics: { th: 'กรีฑา', en: 'Athletics', ability: 'str' },
  deception: { th: 'หลอกลวง', en: 'Deception', ability: 'cha' },
  history: { th: 'ประวัติศาสตร์', en: 'History', ability: 'int' },
  insight: { th: 'หยั่งรู้', en: 'Insight', ability: 'wis' },
  intimidation: { th: 'ข่มขู่', en: 'Intimidation', ability: 'cha' },
  investigation: { th: 'สืบสวน', en: 'Investigation', ability: 'int' },
  medicine: { th: 'การแพทย์', en: 'Medicine', ability: 'wis' },
  nature: { th: 'ธรรมชาติ', en: 'Nature', ability: 'int' },
  perception: { th: 'การรับรู้', en: 'Perception', ability: 'wis' },
  performance: { th: 'การแสดง', en: 'Performance', ability: 'cha' },
  persuasion: { th: 'โน้มน้าว', en: 'Persuasion', ability: 'cha' },
  religion: { th: 'ศาสนา', en: 'Religion', ability: 'int' },
  'sleight-of-hand': { th: 'มือไว', en: 'Sleight of Hand', ability: 'dex' },
  stealth: { th: 'ลอบเร้น', en: 'Stealth', ability: 'dex' },
  survival: { th: 'เอาตัวรอด', en: 'Survival', ability: 'wis' },
} as const satisfies Record<string, { th: string; en: string; ability: Ability }>;
export type Skill = keyof typeof SKILLS;

/** The 15 conditions plus Exhaustion (levels 1–6). Icons are shown on tokens. */
export const CONDITIONS = {
  blinded: { th: 'ตาบอด', en: 'Blinded', icon: '🙈' },
  charmed: { th: 'ถูกสะกดใจ', en: 'Charmed', icon: '💗' },
  deafened: { th: 'หูหนวก', en: 'Deafened', icon: '🔇' },
  frightened: { th: 'หวาดกลัว', en: 'Frightened', icon: '😱' },
  grappled: { th: 'ถูกจับล็อก', en: 'Grappled', icon: '🤼' },
  incapacitated: { th: 'ไร้สมรรถภาพ', en: 'Incapacitated', icon: '💫' },
  invisible: { th: 'ล่องหน', en: 'Invisible', icon: '👻' },
  paralyzed: { th: 'เป็นอัมพาต', en: 'Paralyzed', icon: '⚡' },
  petrified: { th: 'กลายเป็นหิน', en: 'Petrified', icon: '🗿' },
  poisoned: { th: 'ติดพิษ', en: 'Poisoned', icon: '🤢' },
  prone: { th: 'ล้มลง', en: 'Prone', icon: '🛌' },
  restrained: { th: 'ถูกพันธนาการ', en: 'Restrained', icon: '⛓️' },
  stunned: { th: 'มึนงง', en: 'Stunned', icon: '😵' },
  unconscious: { th: 'หมดสติ', en: 'Unconscious', icon: '💤' },
  concentration: { th: 'สมาธิ', en: 'Concentration', icon: '🧠' },
  exhaustion: { th: 'ความอ่อนล้า', en: 'Exhaustion', icon: '🥵' },
} as const;
export type Condition = keyof typeof CONDITIONS;

/** Keys are SRD slugs without the `srd-2024_` prefix. */
export const CLASSES_TH: Record<string, string> = {
  barbarian: 'บาร์บาเรียน', bard: 'บาร์ด', cleric: 'นักบวช', druid: 'ดรูอิด', fighter: 'นักสู้', monk: 'นักพรต',
  paladin: 'พาลาดิน', ranger: 'เรนเจอร์', rogue: 'โร้ก', sorcerer: 'ซอร์เซอเรอร์', warlock: 'วอร์ล็อก', wizard: 'พ่อมด',
};

export const SPECIES_TH: Record<string, string> = {
  dragonborn: 'ดราก้อนบอร์น', dwarf: 'คนแคระ', elf: 'เอลฟ์', gnome: 'โนม', goliath: 'โกไลแอธ', halfling: 'ฮาล์ฟลิง',
  human: 'มนุษย์', orc: 'ออร์ค', tiefling: 'ทีฟลิง',
};

export const BACKGROUNDS_TH: Record<string, string> = {
  acolyte: 'ผู้รับใช้วิหาร', criminal: 'อาชญากร', sage: 'นักปราชญ์', soldier: 'ทหาร',
};
