import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { BLANK, FIELDS, type Field } from './fields';
import { HB_KINDS, HB_SCHEMAS } from './kinds';

const sorted = (a: string[]) => [...a].sort();
const paths = (fields: Field[]) => fields.map((f) => f.path);
const shapeKeys = (schema: z.ZodType) => Object.keys((schema as unknown as z.ZodObject).shape);
/** The element schema of an array field (rows). */
const element = (schema: z.ZodType, key: string): z.ZodType => {
  const field = (schema as unknown as z.ZodObject).shape[key] as z.ZodType;
  return (field as unknown as { element: z.ZodType }).element;
};

describe('homebrew form fields', () => {
  for (const kind of HB_KINDS) {
    it(`${kind}: the form, the blank entry and the schema list the same fields`, () => {
      const schema = HB_SCHEMAS[kind];
      expect(sorted(paths(FIELDS[kind]))).toEqual(sorted(Object.keys(BLANK[kind]())));
      expect(sorted(paths(FIELDS[kind]))).toEqual(sorted(shapeKeys(schema)));
    });

    it(`${kind}: each list of rows has the fields its schema has`, () => {
      const blank = BLANK[kind]();
      for (const f of FIELDS[kind]) {
        if (f.k !== 'rows') continue;
        expect(sorted(paths(f.fields))).toEqual(sorted(Object.keys(f.blank())));
        expect(sorted(paths(f.fields))).toEqual(sorted(shapeKeys(element(HB_SCHEMAS[kind], f.path))));
        expect(blank[f.path]).toEqual([]);
      }
    });
  }
});
