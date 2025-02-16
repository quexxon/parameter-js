interface Parameter<T> {
  (value?: T): T;
}

const isPair = (value: any): boolean => {
  return Array.isArray(value) && value.length === 2;
};

const isThunk = (value: any): boolean => {
  return typeof value === "function" && value.length === 0;
};

const isGuard = (value: any): boolean => {
  return typeof value === "function" && value.length === 1;
};

const parameterSet: WeakSet<Parameter<any>> = new WeakSet();

/**
 * Checks if a value is a parameter function created by makeParameter.
 * 
 * @param value - The value to check
 * @returns True if the value is a parameter function, false otherwise
 * 
 * @example
 * const param = makeParameter(42);
 * isParameter(param); // true
 * isParameter(() => {}); // false
 */
export const isParameter = (value: any): boolean => {
  return parameterSet.has(value);
};

/**
 * Creates a new parameter function that can get and set a value. The value is
 * validated through an optional guard function.
 * 
 * @param initialValue - The initial value for the parameter
 * @param guard - Optional function to validate/transform values (defaults to
 *               identity function)
 * @returns A parameter function that can get and set the value
 * @throws {TypeError} If guard is not a function of one argument
 * 
 * @example
 * const count = makeParameter(0);
 * count(); // returns 0
 * count(5); // sets value to 5 and returns 5
 * 
 * // With a guard function
 * const positiveNum = makeParameter(1, (n) => {
 *   if (n <= 0) throw new Error('Must be positive');
 *   return n;
 * });
 */
export const makeParameter = <T>(
  initialValue: T,
  guard: (value: T) => T = (x) => x
): Parameter<T> => {
  if (!isGuard(guard)) {
    throw new TypeError("Expected guard to be a function of one argument");
  }

  let value = guard(initialValue);

  const parameter: Parameter<T> = function (...args) {
    if (args.length > 0) {
      const [newValue] = args;
      value = guard(newValue as T);
    }

    return value;
  };

  parameterSet.add(parameter);

  return parameter;
};

/**
 * Temporarily sets multiple parameters to new values while executing a thunk
 * (function), then restores the original parameter values afterwards.
 * 
 * @param parameters - An array of tuples, each containing a parameter function
 *                    and its temporary value
 * @param thunk - A function to execute with the temporary parameter values
 * @returns A promise that resolves with the result of the thunk
 * @throws {TypeError} If parameters is not an array of pairs
 * @throws {TypeError} If thunk is not a function with zero arguments
 * @throws {TypeError} If any parameter in the pairs is not a valid parameter
 *                    function
 * 
 * @example
 * const debugMode = makeParameter(false);
 * const logLevel = makeParameter('info');
 * 
 * await parameterize([
 *   [debugMode, true],
 *   [logLevel, 'debug']
 * ], async () => {
 *   // Code here runs with debugMode = true and logLevel = 'debug'
 *   await someOperation();
 * });
 * // Parameters are restored to their original values after execution
 */
export const parameterize = async <T>(
  parameters: Array<[Parameter<any>, any]>,
  thunk: () => T
): Promise<T> => {
  if (!(Array.isArray(parameters) && parameters.every(isPair))) {
    throw new TypeError("Expected first argument to be an array of pairs");
  }

  if (!isThunk(thunk)) {
    throw new TypeError("Expected second argument to be a thunk");
  }

  const originalValues = new Map();
  for (const [parameter] of parameters) {
    if (!isParameter(parameter)) {
      throw new TypeError("Expected first item of pair to be a parameter");
    }
    originalValues.set(parameter, parameter());
  }

  let result;
  try {
    for (const [parameter, value] of parameters) {
      parameter(value);
    }
    result = await thunk();
  } finally {
    for (const [parameter, value] of originalValues.entries()) {
      parameter(value);
    }
  }

  return result;
};
