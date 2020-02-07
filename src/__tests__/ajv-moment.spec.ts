import { plugin, AjvMoment } from '../lib/ajv-moment';
import moment from 'moment';
import Ajv from 'ajv';

const ajv = new Ajv({
  allErrors: true,
  jsonPointers: true,
  $data: true,
  coerceTypes: false,
  format: 'full',
  multipleOfPrecision: 7,
  verbose: true,
  sourceCode: true
});

test('Plugin constructor works', () => {
  const keywordSettings = plugin({ ajv, moment });
  const ajvm = ajv as AjvMoment;
  expect(keywordSettings.type).toBe('string');
  expect(keywordSettings.statements).toBe(true);
  expect(keywordSettings.errors).toBe(true);
  expect(keywordSettings.inline).toBeInstanceOf(Function);
  expect(ajvm.moment.fn.isSame).toBeDefined();
});
