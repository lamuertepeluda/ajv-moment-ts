import Ajv from 'ajv';
import moment from 'moment';

const momentFns = Object.keys(moment.fn);

export interface IAJVMomentOptions {
  ajv: Ajv.Ajv;
  moment: moment.Moment;
}

export interface IAjvMoment extends Ajv.Ajv {
  moment: moment.Moment;
}

export interface IAJVMomentValue {
  format?: string[];
  now?: boolean;
  $data?: string;
  manipulate?: any[];
  value?: string;
}

interface IAJVMomentValidationOut {
  test: string;
  value: IAJVMomentValue[];
}

type AJVMomentValidationValue = string | IAJVMomentValue;

export interface IAJVMomentValidationIn {
  test: string;
  value: AJVMomentValidationValue;
}

/**
 * Configure the plugin by attaching moment to the ajv instance and defining the
 * 'moment' custom keyword
 * @param  {Object} options - plugin options
 * @return {Object} keywordSettings
 */
function plugin(options: IAJVMomentOptions) {
  if (!options || typeof options !== 'object') {
    throw new Error('AjvMoment#plugin requires options');
  }
  if (!options.ajv) {
    throw new Error(`AjvMoment#plugin options requries an 'ajv' attribute (ajv instance)`);
  }
  if (!options.moment) {
    throw new Error(`AjvMoment#plugin options requries a 'moment' attribute (moment.js)`);
  }
  const { ajv, moment } = options;
  (ajv as IAjvMoment).moment = moment;
  const keywordSettings = {
    type: 'string',
    statements: true,
    errors: true,
    inline
  };
  if (ajv) {
    ajv.addKeyword('moment', keywordSettings);
  }
  return keywordSettings;
}

function inline(it: Ajv.CompilationContext, keyword: string, schema: any): string {
  const data = 'data' + (it.dataLevel || '');
  const valid = 'valid' + it.level;
  const err = 'ajvmErrMsg' + it.level;
  const schemaOptions = typeof schema === 'object' ? schema : {};
  const formats = schemaOptions.format || [];
  const validations: IAJVMomentValidationIn[] = typeof schemaOptions.validate === 'undefined' ? [] : Array.isArray(schemaOptions.validate) ? schemaOptions.validate : [schemaOptions.validate];

  const _validations = validations.map(validation => {
    const { test, value } = validation;
    if (!test || !momentFns.includes(test)) {
      throw new Error('Invalid validation: "test" is required and must be a valid moment function');
    }
    if (!value) {
      throw new Error('Invalid validation: "value" is required');
    }

    const _value: AJVMomentValidationValue[] = Array.isArray(value) ? value : [value];

    const _validation: IAJVMomentValidationOut = {
      // moment function
      test,
      // output value
      value: _value.map(function(val): IAJVMomentValue {
        const _val: IAJVMomentValue = {};
        if (typeof val === 'string') {
          _val.value = JSON.stringify(val);
        } else {
          const { now, $data, manipulate } = val;
          if (now !== true && typeof $data === 'string') {
            _val.value = it.util.getData($data, it.dataLevel, it.dataPathArr);
          }
          _val.manipulate = Array.isArray(manipulate)
            ? manipulate.map(function(manipulation) {
                const manipulationMethod = Object.keys(manipulation)[0];
                if (!momentFns.includes(manipulationMethod)) {
                  throw new Error(`Invalid validation value: unsupported manipulation method specified: ${manipulationMethod}`);
                }
                return {
                  method: manipulationMethod,
                  args: Array.isArray(manipulation[manipulationMethod]) ? manipulation[manipulationMethod] : [manipulation[manipulationMethod]]
                };
              })
            : [];
        }
        return _val;
      })
    };
    return _validation;
  });

  let templ = `
  const moment = self.moment;
  ${valid} = true;
  const ${err} = {
      keyword: "${keyword}",
      dataPath: (dataPath || ''),
      schemaPath: "${it.schemaPath}",
      data: ${data}
  };

  const ajvmFormats${it.level} = ${formats && formats.length ? JSON.stringify(formats) : '[moment.ISO_8601]'};
  const ajvmStrict${it.level} = ${formats && formats.length ? true : false};
  let d = moment(${data}, ajvmFormats${it.level}, ajvmStrict${it.level});
  if (!d.isValid()) {
      ${err}.message = 'should be a valid date${formats && formats.length ? ' with format ' + JSON.stringify(formats) : ''}';
      ${valid} = false;
  }`;

  templ += _validations
    .map(function(validation, i): string {
      const testResult = 'ajvmTestResult_' + it.level + '_' + i;

      const pieceOfCode: { tval: string; tmpl: string } = {
        tval: '[',
        tmpl: `
            if (${valid} === true) {
          `
      };
      const results = validation.value.reduce(function(res, val, ii) {
        const testVal = 'ajvmTestVal_' + it.level + '_' + i + '_' + ii;
        res.tval += testVal + ',';
        if (val.now === true) {
          res.tmpl += `
            const ${testVal} = moment();
            `;
        } else {
          res.tmpl += `
                  const ${testVal} = moment(${val.value}, ${val.format ? JSON.stringify(val.format) : '[moment.ISO_8601]'});
            `;
        }
        if (Array.isArray(val.manipulate)) {
          res.tmpl += val.manipulate
            .map(function(manipulation): string {
              return `${testVal}.${manipulation.method}.apply(${testVal}, ${JSON.stringify(manipulation.args)});`;
            })
            .join('');
        }
        return res;
      }, pieceOfCode);

      const testVals = results.tval.slice(0, results.tval.length - 1) + ']';
      pieceOfCode.tmpl += `
                  const ${testResult} = d.${validation.test}.apply(d, ${testVals});
                  if (!${testResult}) {
                      ${err}.message = '"${validation.test}" validation failed for value(s): ';
                      ${testVals}.forEach(function(c) {
                          ${err}.message += ${err}.data + ' (' + c.toISOString() + ')' + ', ';
                      });
                      ${err}.message = ${err}.message.slice(0, -2);
                      ${valid} = false;
                  }
              }
          `;

      return pieceOfCode.tmpl;
    })
    .join('');
  templ += `
            if (!${valid}) {
                errors++;
                if (vErrors) {
                    vErrors[vErrors.length] = ${err};
                } else {
                    vErrors = [${err}]
                }
            }
        `;

  return templ;
}

export default plugin;
export { plugin };
