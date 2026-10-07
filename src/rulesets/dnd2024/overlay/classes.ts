// What each class makes the player decide, by level. Feature names are SRD 5.2's; classes.test.ts checks them.
import type { ChoicePoint, ClassRules } from './types';

const asi = (...levels: number[]): ChoicePoint[] => levels.map((level) => ({ level, feature: 'Ability Score Improvement', kind: 'asi' }));
const epicBoon: ChoicePoint = { level: 19, feature: 'Epic Boon', kind: 'asi', epicBoon: true };
/** Subclass at 3, Ability Score Improvements (at 4, 8, 12, 16 unless the class gets extra ones), Epic Boon at 19. */
const common = (subclassFeature: string, asiLevels = [4, 8, 12, 16]): ChoicePoint[] => [
  { level: 3, feature: subclassFeature, kind: 'subclass' }, ...asi(...asiLevels), epicBoon,
];
const rules = (key: string, choices: ChoicePoint[], extra: Partial<ClassRules> = {}): ClassRules =>
  ({ key, choices: [...choices].sort((a, b) => a.level - b.level), ...extra });

export const CLASS_RULES: ClassRules[] = [
  rules('barbarian', [
    { level: 1, feature: 'Weapon Mastery', kind: 'masteries', filter: 'melee', count: 2 },
    ...common('Barbarian Subclass'),
  ]),
  rules('bard', [
    { level: 2, feature: 'Expertise', kind: 'expertise', count: 2 },
    { level: 9, feature: 'Expertise', kind: 'expertise', count: 2 },
    ...common('Bard Subclass'),
  ]),
  rules('cleric', [
    {
      level: 1, feature: 'Divine Order', kind: 'order',
      options: [{ id: 'protector', name: 'Protector' }, { id: 'thaumaturge', name: 'Thaumaturge', extraCantrips: 1 }],
    },
    ...common('Cleric Subclasses'),
  ]),
  rules('druid', [
    {
      level: 1, feature: 'Primal Order', kind: 'order',
      options: [{ id: 'magician', name: 'Magician', extraCantrips: 1 }, { id: 'warden', name: 'Warden' }],
    },
    ...common('Druid Subclass'),
  ]),
  rules('fighter', [
    { level: 1, feature: 'Fighting Style', kind: 'fightingStyle' },
    { level: 1, feature: 'Weapon Mastery', kind: 'masteries', filter: 'any', count: 3 },
    ...common('Fighter Subclass', [4, 6, 8, 12, 14, 16]),
  ]),
  rules('monk', common('Monk Subclass')),
  rules('paladin', [
    { level: 1, feature: 'Weapon Mastery', kind: 'masteries', filter: 'proficient', count: 2 },
    { level: 2, feature: 'Fighting Style', kind: 'fightingStyle' },
    ...common('Paladin Subclass'),
  ]),
  rules('ranger', [
    { level: 1, feature: 'Weapon Mastery', kind: 'masteries', filter: 'proficient', count: 2 },
    { level: 2, feature: 'Fighting Style', kind: 'fightingStyle' },
    { level: 2, feature: 'Deft Explorer', kind: 'expertise', count: 1 },
    { level: 9, feature: 'Expertise', kind: 'expertise', count: 2 },
    ...common('Ranger Subclass'),
  ]),
  rules('rogue', [
    { level: 1, feature: 'Expertise', kind: 'expertise', count: 2 },
    { level: 1, feature: 'Weapon Mastery', kind: 'masteries', filter: 'proficient', count: 2 },
    { level: 6, feature: 'Expertise', kind: 'expertise', count: 2 },
    ...common('Rogue Subclass', [4, 8, 10, 12, 16]),
  ]),
  rules('sorcerer', [
    { level: 2, feature: 'Metamagic', kind: 'metamagic', count: 2 },
    { level: 10, feature: 'Metamagic', kind: 'metamagic', count: 2 },
    { level: 17, feature: 'Metamagic', kind: 'metamagic', count: 2 },
    ...common('Sorcerer Subclass'),
  ]),
  rules('warlock', [
    { level: 1, feature: 'Eldritch Invocations', kind: 'invocations', count: 1 },
    ...common('Warlock Subclass'),
  ]),
  rules('wizard', [
    { level: 2, feature: 'Scholar', kind: 'expertise', count: 1 },
    ...common('Wizard Subclass'),
  ], { spellbook: 6 }),
];
