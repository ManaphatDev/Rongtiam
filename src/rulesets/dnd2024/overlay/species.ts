// The decisions each SRD 5.2 species asks for. Option names come from the trait text; species.test.ts checks them.
import type { SpeciesChoice, SpeciesRules } from './types';

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const options = (...names: string[]) => names.map((name) => ({ id: slug(name), name }));
const option = (id: string, trait: string, label: string, names: string[]): SpeciesChoice =>
  ({ id, kind: 'option', trait, label, options: options(...names) });

export const SPECIES_RULES: SpeciesRules[] = [
  {
    key: 'dragonborn',
    choices: [option('ancestry', 'Draconic Ancestry', 'บรรพบุรุษมังกร',
      ['Black', 'Blue', 'Brass', 'Bronze', 'Copper', 'Gold', 'Green', 'Red', 'Silver', 'White'])],
  },
  { key: 'dwarf', choices: [] },
  {
    key: 'elf',
    choices: [
      option('lineage', 'Elven Lineage', 'สายเลือดเอลฟ์', ['Drow', 'High Elf', 'Wood Elf']),
      { id: 'skill', kind: 'skill', trait: 'Keen Senses', from: ['insight', 'perception', 'survival'] },
    ],
  },
  { key: 'gnome', choices: [option('lineage', 'Gnomish Lineage', 'สายเลือดโนม', ['Forest Gnome', 'Rock Gnome'])] },
  {
    key: 'goliath',
    choices: [option('ancestry', 'Giant Ancestry', 'บรรพบุรุษยักษ์',
      ["Cloud's Jaunt", "Fire's Burn", "Frost's Chill", "Hill's Tumble", "Stone's Endurance", "Storm's Thunder"])],
  },
  { key: 'halfling', choices: [] },
  {
    key: 'human',
    choices: [
      { id: 'skill', kind: 'skill', trait: 'Skillful', from: 'any' },
      { id: 'feat', kind: 'originFeat', trait: 'Versatile' },
    ],
  },
  { key: 'orc', choices: [] },
  { key: 'tiefling', choices: [option('legacy', 'Fiendish Legacy', 'มรดกปีศาจ', ['Abyssal', 'Chthonic', 'Infernal'])] },
];
