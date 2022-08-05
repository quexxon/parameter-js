const IS_PARAMETER_METHOD = Symbol('IS_PARAMETER_METHOD')
const PARAMETER_SECRET = Symbol('PARAMETER_SECRET')
const METHOD_SECRET = Symbol('METHOD_SECRET')

const isParameter = (value) => {
  if (
    typeof value !== 'function' ||
    !Object.hasOwn(value, IS_PARAMETER_METHOD)
  ) {
    return false
  }

  return value[IS_PARAMETER_METHOD](PARAMETER_SECRET) === METHOD_SECRET
}

const isPair = (value) => {
  return Array.isArray(value) && value.length === 2
}

const isThunk = (value) => {
  return typeof value === 'function' && value.length === 0
}

const isGuard = (value) => {
  return typeof value === 'function' && value.length === 1
}

const makeParameter = (initialValue, guard = (x) => x) => {
  if (!isGuard(guard)) {
    throw new TypeError('Expected guard to be a function of one argument')
  }

  let value = guard(initialValue)

  const parameter = (...args) => {
    if (args.length > 0) {
      const [newValue] = args
      value = guard(newValue)
    }

    return value
  }

  parameter[IS_PARAMETER_METHOD] = (secret) => {
    if (secret === PARAMETER_SECRET) {
      return METHOD_SECRET
    }
  }

  return parameter
}

const parameterize = async (parameters, thunk) => {
  if (!(Array.isArray(parameters) && parameters.every(isPair))) {
    throw new TypeError('Expected first argument to be an array of pairs')
  }

  if (!isThunk(thunk)) {
    throw new TypeError('Expected second argument to be a thunk')
  }

  const originalValues = new Map()
  for (const [parameter] of parameters) {
    if (!isParameter(parameter)) {
      throw new TypeError('Expected first item of pair to be a parameter')
    }
    originalValues.set(parameter, parameter())
  }

  let result; try {
    for (const [parameter, value] of parameters) {
      parameter(value)
    }
    result = await thunk()
  } finally {
    for (const [parameter, value] of originalValues.entries()) {
      parameter(value)
    }
  }

  return result
}

module.exports = {
  isParameter,
  makeParameter,
  parameterize
}
