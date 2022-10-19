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

export const isParameter = (value: any): boolean => {
  return parameterSet.has(value);
};

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
