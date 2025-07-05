> [!IMPORTANT]
> Migrated to [quexxon/parameter-js](https://codeberg.org/quexxon/parameter-js) on Codeberg.

# Using Dynamic Scope

The majority of post-ALGOL 60 programming languages are lexically scoped, to the
degree that many (most?) contemporary programmers have no hands-on familiarity
with dynamic scope. This is a shame, because dynamic scope can provide the same
power and flexibility as globally-scoped variables without many of the commonly
associated pitfalls. Fortunately, opt-in dynamic scope can be added to any
language with support for closures and first-class functions (it can be
implemented with classes as well as long as the language supports exporting
object instances, but I prefer the functional implementation). This guide will
demonstrate various techniques for using dynamic scope with an example
implementation in JavaScript.

## An Aside About Lisp

One realm where dynamic scope is alive and well is the [Land of
Lisp](http://landoflisp.com/). Traditionally, dynamic scope was the default in
Lisp dialects (this is still the case in Emacs Lisp). These days, following the
example of Scheme, most Lisps are lexically scoped by default but include
optional support for dynamic scoping.

Relevant references for various Lisp dialects:

- [Chez Scheme](https://cisco.github.io/ChezScheme/csug9.5/system.html#g124)
- [Racket](https://docs.racket-lang.org/reference/parameters.html)
- [Common Lisp](https://gigamonkeys.com/book/variables.html#dynamic-aka-special-variables)
- [Janet](https://janet-lang.org/docs/fibers/dynamic_bindings.html)
- [Emacs Lisp](https://www.gnu.org/software/emacs/manual/html_node/elisp/Variable-Scoping.html)

This guide adopts the API of Chez Scheme and Racket (though our version's syntax
won't be quite as nice since JavaScript lacks Lisp's macros).

## Basics

We will be introducing dynamic scope through the use of a parameterization
construct. The two basic functions in our API will be `makeParameter` and
`parameterize`. The `makeParameter` function creates a new parameter with
dynamic scope. It optionally accepts an initial value for the parameter. When
this value is omitted, the initial value is `undefined`. A parameter is a
function of zero or one argument. When called without an argument, the function
returns the parameter's current value. When called with an argument, the
function sets the parameter's value to the value of the given argument and
returns the updated value.

```javascript
const color = makeParameter("red");
console.log(color()); // red
color("blue");
console.log(color()); // blue
```

In lexical scoping, a variable's value can be determined statically by its
surrounding context. This is not the case with dynamic scope. For example:

```javascript
const lexicalColor = "red";
const dynamicColor = makeParameter("blue");

function logColor() {
  // This will always log "red". The value is determined by the lexical
  // context in which the function is defined.
  console.log(lexicalColor);

  // We can't know what this will log at this point. The value is determined
  // by the dynamic context in which the function is called.
  console.log(dynamicColor());
}

// In this context, both statements will log "red".
logColor();

dynamicColor("blue");
// In this context, the first log statement will log "red", but the second
// will log "blue". A similar effect could be achieved if `dynamicColor` were
// a global variable, but note that the parameter variable is block-scoped—
// to the module in this case.
logColor();
```

With parameters, we get the dynamic power of global scope without the danger of
some unrelated code introducing global with the same name. Though `dynamicColor`
provides a dynamically-bound value, the `dynamicColor` variable is lexically
scoped to the module. The binding can be shadowed, but not replaced. Dynamic
bindings via parameters can be created in any scope and exposed as part of a
module's public interface.

```javascript
// error.js

import { makeParameter } from "@qxn/parameter";

export const logPrefix = makeParameter("ERROR: ");

export function logError(error) {
  console.error(`${logPrefix()}${error.message}`);
}

// main.js

import { logPrefix, logError } from "./error.js";

const error = new Error("Something blew up!");

logError(error); // Error: Something blew up!

logPrefix("💣 => ");

logError(error); // 💣 => Something blew up!
```

The examples we've seen so far are still prey to one of the same dangers as
global scope. Temporarily changing the value of a dynamic binding and then
resetting it to its original value requires careful discipline from the
programmer, especially in the face of errors. It's easy to get wrong or to omit
unintentionally. Using the code above as an example:

```javascript
import { logPrefix, logError } from "./error.js";

const error = new Error("Something blew up!");

logError(error); // Error: Something blew up!

// We'd like to temporarily change the log prefix and reset after,
// so we need to do more work.
const initialLogPrefix = logPrefix();
logPrefix("💣 => ");
logError(error); // 💣 => Something blew up!
logPrefix(initialLogPrefix);

// This works in this case, but it's a lot of ceremony.
// It won't work at all if an error occurs before the reset.
logPrefix("💣 => ");
try {
  throw new Error("Something exploded!");
} catch (error) {
  logError(error); // 💣 => Something exploded!
  throw error;
}
// Because we re-threw the error above, this reset is never reached.
// We neglected to add an additional surrounding `try...catch` statement.
logPrefix(initialLogPrefix);
```

To solve the problems of boilerplate, multiple bindings, and error recovery, we
introduce the `parameterize` function. It creates a new scope during which a set
of new parameter bindings are effective and replaces the original values
afterwards—even if an error occurs. The `parameterize` function accepts two
arguments, an array of `[parameter, value]` pairs and a thunk to be
parameterized. If you aren't familiar with the term, a thunk is a function that
accepts no arguments. In this context, it's a means of achieving lazy
evaluation.

```javascript
import { makeParameter, parameterize } from "parameter";

const configDirectory = makeParameter("/home/will/.config");
const configFile = makeParameter("config.yaml");

function logConfigPath() {
  console.log([configDirectory(), configFile()].join("/"));
}

logConfigPath(); // Logs: /home/will/.config/config.yaml

try {
  parameterize(
    [
      [configDirectory, "test/config"],
      [configFile, "development.yaml"],
    ],
    () => {
      logConfigPath(); // Logs: test/config/development.yaml
      throw new Error("Whoops!");
    }
  );
} catch {
  // ignore error
}

// Parameters are reset even though an error occurred during the
// parameterized function.
logConfigPath(); // Logs: /home/will/.config/config.yaml
```

### Guards

Our `makeParameter` function has one more trick up its sleeve that we've omitted
until this point for simplicity. An optional second argument accepts a guard
function that can validate and/or transform any value provided for the
parameter. The guard must be a single argument function that accepts a candidate
value for the parameter and returns the value if valid. The guard should throw
an error if the value is invalid, and may optionally transform the value before
returning it.

```javascript
import { makeParameter } from "@qxn/parameter";

const rgbChannel = makeParameter("red", (value) => {
  const validTypes = ["string", "number", "bigint"];
  if (!validTypes.includes(typeof value)) {
    throw new TypeError("Expected one of: " + validTypes.join(", "));
  }

  if (typeof value === "string") {
    // Ignore case of argument, but standardize on lowercase
    value = value.trim().toLowerCase();

    if (!["red", "green", "blue"].includes(value)) {
      throw new Error("Expected one of: red, green, blue");
    }
  } else {
    const hexToChannel = {
      0xff0000: "red",
      0xff00: "green",
      0xff: "blue",
    };

    value = hexToChannel[Number(value)];
    if (value === undefined) {
      throw new Error(
        "Expected one of: " +
          Object.keys(hexToChannel)
            .map((n) => "0x" + parseInt(n).toString(16).toUpperCase())
            .join(", ")
      );
    }
  }

  return value;
});

rgbChannel("yellow"); // Not red, green, or blue. throws
rgbChannel("blue"); // That's more like it!
rgbChannel("\ngrEEn "); // This is okay.
rgbChannel(0xff0000); // This is also okay.
rgbChannel(100); // This is not okay. throws
```

## A Few Use Cases

Following is a non-comprehensive survey of use cases where dynamic scope can be
particularly powerful and often more simple or elegant than the alternatives.

### Safer Alternative to Global Variables

A parameter can be used anywhere that a global variable would be used, but with
the following advantages:

- Parameter bindings can be module-scoped, and thus cannot be clobbered by other
  bindings with the same name in unrelated code. Importing a parameter from a
  module also makes its provenance explicit.
- Parameters can install guards to protect against assignment of invalid values.
- While parameters can be shadowed, doing so will only have an effect within the
  lexical scope where the shadowing variable occurs as opposed to the entire
  global scope—limiting the impact of misuse.

Like global variables, dynamic parameters also allow action at a
distance—potentially introducing difficult to trace bugs if used carelessly.
Great power and flexibility require discipline.

As an example, consider a Node.js `io` module exposing parameters for the
standard in, out, and error streams. A parameterized `stdout` could be used to
temporarily send a subset of an application's logs to a different stream (e.g. a
file, TCP socket, or crypto stream).

```javascript
// io.js ---------------------------------------------------------------

import { makeParameter } from "@qxn/parameter";

export const stdin = makeParameter(process.stdin);
export const stdout = makeParameter(process.stdout);
export const stderr = makeParameter(process.stderr);

export const log = (string) => {
  stdout().write(string + "\n");
};

// main.js -------------------------------------------------------------

const main = () => {
  // Do something useful, and log it.
};

// When our application runs in RECORD mode, stream all logs to a
// timestamped, compressed tmp file rather than standard output.
if (process.env.RUNTIME_MODE === "RECORD") {
  import { compose } from "stream";
  import { createGzip } from "zlib";
  import { createWriteStream } from "fs";
  import { stdout } from "./io.js";

  const compressedLogStream = compose(
    createGzip(),
    createWriteStream(`/tmp/${new Date().toISOString()}.logs.gz`)
  );

  parameterize([[stdout, compressedLogStream]], () => {
    main();
    compressedLogStream.end();
  });
} else {
  main();
}
```

#### Examples From the Wild

From Chez Scheme:

- [`command-line`](https://cisco.github.io/ChezScheme/csug9.5/system.html#./system:s193)
- [`command-line-arguments`](https://cisco.github.io/ChezScheme/csug9.5/system.html#./system:s195)

From Janet:

- [`*out*`](https://janet-lang.org/api/index.html#*out*)
- [`*executable*`](https://janet-lang.org/api/index.html#*executable*)

From Common Lisp:

- [`*gensym-counter*`](http://www.lispworks.com/documentation/HyperSpec/Body/v_gensym.htm#STgensym-counterST)
- [`*readtable*`](http://www.lispworks.com/documentation/HyperSpec/Body/v_rdtabl.htm#STreadtableST)

### Lightweight Dependency Injection

Parameters can host services with API contracts enforced by their guards. This
supports a generic, lightweight form of dependency injection wherein consumers
can explicitly depend on contracts for services that are satisfied at runtime.

**Caveat Emptor**: Don't try this with discrete resources in multi-threaded
programs! [Sage
advice](https://stuartsierra.com/2013/03/29/perils-of-dynamic-scope) from one of
Clojure's core developers.

```javascript
// provider.js ---------------------------------------------------------

import { makeParameter } from "@qxn/parameter";

export const databaseConnection = makeParameter(undefined, (value) => {
  // Verify that value satisfies database connection contract.
});

// consumer.js ---------------------------------------------------------

import { databaseConnection } from "./provider.js";

const db = databaseConnection();

export const getAllUsers = () => {
  return db.query("SELECT * FROM user");
};

// main.js -------------------------------------------------------------

import { parameterize } from "@qxn/parameter";
import { databaseConnection } from "./provider.js";
import { getAllUsers } from "./consumer.js";
import * as sqlite from "sqlite";

const main = async () => {
  console.log("USERS:", await getAllUsers());
};

parameterize([[databaseConnection, sqlite("./test.db")]], () => {
  main();
});
```

### Application Configuration

One of the most useful applications of dynamic scope is application
configuration. Guarded parameters allow for robust runtime enforcement of
configuration constraints. The example below is somewhat contrived, but one
particularly effective real-world use case is configuration for low-level or
specialized tuning (e.g. a setting affecting garbage collection settings might
be parameterized for a particular code path where it would yield performance
benefit).

```javascript
// configuration.js ----------------------------------------------------

import { makeParameter } from "@qxn/parameter";

export const configuration = {
  database: {
    hostname: makeParameter(process.env.DB_HOST, (value) => {
      // validate hostname
      return value;
    }),
    port: makeParameter(process.env.DB_PORT, (value) => {
      // validate port
      return value;
    }),
    username: makeParameter(process.env.DB_USER, (value) => {
      // validate username
      return value;
    }),
    password: makeParameter(process.env.DB_PASS, (value) => {
      // validate password
      return value;
    }),
  },
};

// main.js -------------------------------------------------------------

import { parameterize } from "@qxn/parameter";
import { configuration } from "./configuration.js";

const main = () => {
  const db = new Database({
    hostname: configuration.database.hostname(),
    port: configuration.database.port(),
    username: configuration.database.username(),
    password: configuration.database.password(),
  });

  // Do something useful with database
};

// Assuming our application is automatically restarted on file change by a
// process manager, this parameterization allows hotswappable configuration
// during development.
if (process.env.ENVIRONMENT === "development") {
  parameterize([[configuration.database.hostname, "localhost"]], () => {
    main();
  });
} else {
  main();
}
```

#### Examples From the Wild

From Chez Scheme:

- [`source-directories`](https://cisco.github.io/ChezScheme/csug9.5/system.html#./system:s102)
- [`optimize-level`](https://cisco.github.io/ChezScheme/csug9.5/system.html#./system:s104)
- [`debug-level`](https://cisco.github.io/ChezScheme/csug9.5/system.html#./system:s110)
- [`undefined-variable-warnings`](https://cisco.github.io/ChezScheme/csug9.5/system.html#./system:s123)

From Janet:

- [_err-color_](https://janet-lang.org/api/index.html#*err-color*)
- [_pretty-format_](https://janet-lang.org/api/index.html#*pretty-format*)

### Runtime Hooks

Dynamic scope allows runtime assignment of handler functions that can provide
custom behavior deep within a system via exposed hooks.

#### Examples From the Wild

From Chez Scheme:

- [`keyboard-interrupt-handler`](https://cisco.github.io/ChezScheme/csug9.5/system.html#./system:s20)
- [`timer-interrupt-handler`](https://cisco.github.io/ChezScheme/csug9.5/system.html#./system:s24)
- [`exit-handler`](https://cisco.github.io/ChezScheme/csug9.5/system.html#./system:s181)

### Testing

The combination of the above techniques provides a powerful set of tools for
testing: dependency injection makes mocking trivial, flexible application
configuration supports comprehensive test coverage for environment-specific code
paths, hooks can support simple performance profiling that might otherwise be
difficult to capture without instrumenting the code.

## The Implementation

We'll begin with a straightforward implementation of the `makeParameter` and
`parameterize` functions and then expand them to add additional features and
more robust handling for edge cases. We'll use JavaScript, but a similar
implementation will work in any language that supports closures and first-class
functions.

```javascript
export const makeParameter = (initialValue) => {
  let value = initialValue;

  return (newValue) => {
    // We'll need to fix this later, because we'd like parameters to
    // support any value, including `undefined`.
    if (newValue !== undefined) {
      value = newValue;
    }
    return value;
  };
};

export const parameterize = (parameters, thunk) => {
  // We'll need to validate the provided arguments later.

  // Store the original values.
  const originalValues = new Map();
  for (const [parameter] of parameters) {
    originalValues.set(parameter, parameter());
  }

  let result;
  try {
    // Update the values of any provided parameters.
    for (const [parameter, value] of parameters) {
      parameter(value);
    }
    result = thunk();
  } finally {
    // Restore the original values, even if an error occurs.
    for (const [parameter, value] of originalValues.entries()) {
      parameter(value);
    }
  }

  return result;
};
```

This naive implementation will work for all the examples so far, but we can do
better. For instance, another improvement we can make over global variables is
adding a layer of validation to our parameter updates. This will us from bogus
values and protect callers from potential bugs. We'll upgrade the
`makeParameter` function to add an optional guard function as a second argument.
The guard function should accept one argument (the new candidate value for the
parameter), throw an error if the value is invalid, and return the value (or a
modified version) otherwise.

```javascript
export const makeParameter = (initialValue, guard) => {
  let value = guard(initialValue);

  return (newValue) => {
    if (newValue !== undefined) {
      value = guard(newValue);
    }
    return value;
  };
};
```

Guards can be simple or arbitrarily complex, allowing for robust type checking
and coercion.

```javascript
const rgbChannel = makeParameter('red', (value) => {
    if (typeof value !== 'string') {
        throw new TypeError('Expected a string')
    }

    // Ignore case of argument, but standardize on lowercase
    value = value.toLowerCase()

    if (!['red', 'green', 'blue'].includes(value)) {
        throw new Error('Expected one of: red, green, blue')
    }

    return value
})

rgbChannel(#ff0000)  // Hex representation of red, but not a string. throws
rgbChannel('yellow') // Not red, green, or blue. throws
rgbChannel('blue')   // That's more like it!
```

Now let's tweak `makeParameter` to support `undefined` values in the returned function.

```javascript
export const makeParameter = (initialValue, guard) => {
  let value = guard(initialValue);

  return (...args) => {
    if (args.length > 0) {
      const [newValue] = args;
      value = guard(newValue);
    }
    return value;
  };
};

const someParam = makeParameter();

// Before
someParam(); // undefined supported for initial value
someParam(5); // value is now 5
someParam(undefined); // value is still 5

// After
someParam(undefined); // value is now `undefined` as expected
```

Let's add an `isParameter` predicate function to determine whether a given value
is a parameter. We'll need this function later on to validate the arguments of
`parameterize`.

You might be surprised by how tricky this is in JavaScript. Before consulting
the following implementation, try your hand at defining a version of
`isParameter` that only returns `true` for parameters and returns `false` for
all other values. If you opt for duck typing, does your function return a false
positive for values that look and behave like parameters? If you decided to use
a private prototype and `instanceof`, is it possible to sniff out your prototype
and apply it to some non-parameter object? If you tried a hidden property via a
private `Symbol`, is it possible to access the value of that `Symbol`? If you're
interning all parameters, are you releasing the allocated memory when parameters
are garbage collected?

```javascript
// Create a private WeakSet to maintain references to all parameters created
// via `makeParameter`. Garbage collected parameters will be removed from the
// set.
const parameterSet = new WeakSet();

export const makeParameter = (initialValue, guard) => {
  let value = guard(initialValue);

  const parameter = (...args) => {
    if (args.length > 0) {
      const [newValue] = args;
      value = guard(newValue);
    }
    return value;
  };

  // Add newly minted parameters to the parameter set.
  parameterSet.add(parameter);

  return parameter;
};

// Only values with a reference in the parameter set are parameters.
export const isParameter = (value) => {
  return parameterSet.has(value);
};

// Usage --------------------------------------------------------------------

const param = makeParameter();

isParameter(param); // true

param.length; // 0
typeof param; // 'function'
const fakeParam = () => {};

isParameter(fakeParam); // false
```

**Note:** If this is a fun problem for you, reach out for two other ways to
solve it—including a method that doesn't use `WeakSet` or `WeakMap`.

Now that we have `isParameter`, we can make `parameterize` more robust.

```javascript
// We add a few additional predicate functions to help check for types
const isPair = (value) => {
  return Array.isArray(value) && value.length === 2;
};

const isThunk = (value) => {
  return typeof value === "function" && value.length === 0;
};

export const parameterize = (parameters, thunk) => {
  // We add runtime checks for the given arguments
  if (!(Array.isArray(parameters) && parameters.every(isPair))) {
    throw new TypeError("Expected first argument to be an array of pairs");
  }

  if (!isThunk(thunk)) {
    throw new TypeError("Expected second argument to be a thunk");
  }

  const originalValues = new Map();
  for (const [parameter] of parameters) {
    // We confirm that the first item of each pair is a parameter.
    // The second item can be any type so a type check is unnecessary.
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
    result = thunk();
  } finally {
    for (const [parameter, value] of originalValues.entries()) {
      parameter(value);
    }
  }

  return result;
};
```
