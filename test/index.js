const tap = require("tap");

const { isParameter, makeParameter, parameterize } = require("../dist");

const getTestValues = ({ include = [], typesToSkip = [] } = {}) => {
  typesToSkip = new Set(typesToSkip);

  const values = {
    bigint: 0n,
    boolean: true,
    function: () => {},
    number: 0,
    object: null,
    string: "",
    symbol: Symbol(""),
    undefined,
  };

  const result = include;

  for (const type in values) {
    if (!typesToSkip.has(type)) {
      result.push(values[type]);
    }
  }

  return result;
};

tap.test("isParameter returns true when applied to a parameter", (t) => {
  const param = makeParameter("some value");

  t.ok(isParameter(param));

  t.end();
});

tap.test("isParameter returns false when applied to a non-parameter", (t) => {
  for (const value of getTestValues()) {
    t.notOk(isParameter(value));
  }

  const fakeParam = () => {};
  t.notOk(isParameter(fakeParam));

  t.end();
});

tap.test(
  "makeParameter creates a parameter function that returns the provided value",
  (t) => {
    const theAnswer = makeParameter(42);

    t.ok(isParameter(theAnswer));
    t.equal(theAnswer(), 42);

    t.end();
  }
);

tap.test("Passing a new value updates the parameter", (t) => {
  const initialValue = "apple";
  const updatedValue = "orange";
  const fruit = makeParameter(initialValue);

  t.equal(fruit(), initialValue);
  t.equal(fruit(updatedValue), updatedValue);
  t.equal(fruit(), updatedValue);

  t.end();
});

tap.test("Calling a parameter returns the value of a given guard", (t) => {
  const input = "a";
  const expected = "A";
  const letter = makeParameter(input, (v) => v.toUpperCase());

  t.equal(letter(), expected);

  t.end();
});

tap.test("makeParameter throws if the given guard throws", (t) => {
  const isLetter = (value) => {
    if (typeof value !== "string" || !value.match(/^[a-z]$/i)) {
      throw new TypeError("Expected a letter");
    }
    return value.toLowerCase();
  };

  t.throws(() => makeParameter(1, isLetter), TypeError);
  t.throws(() => makeParameter("not a letter", isLetter), TypeError);

  t.end();
});

tap.test("A parameter function throws if the given guard throws", (t) => {
  const isLetter = (value) => {
    if (typeof value !== "string" || !value.match(/^[a-z]$/i)) {
      throw new TypeError("Expected a letter");
    }
    return value.toLowerCase();
  };
  const letter = makeParameter("a", isLetter);

  t.throws(() => letter(0), TypeError);

  t.end();
});

tap.test("An async guard yields an async parameter function", async (t) => {
  const letter = makeParameter(
    "a",
    (v) => new Promise((resolve) => resolve(v))
  );

  t.ok(letter() instanceof Promise);
  t.equal(await letter(), "a");

  t.end();
});

tap.test("makeParameter throws when given an invalid guard", (t) => {
  for (const value of getTestValues({ typesToSkip: ["undefined"] })) {
    t.throws(() => makeParameter("", value));
  }

  t.end();
});

tap.test(
  "parameterize replaces parameter values within a given thunk",
  async (t) => {
    const letter = makeParameter("a");
    const number = makeParameter(0);
    const boolean = makeParameter(true);

    // Initial parameter values
    t.equal(letter(), "a");
    t.equal(number(), 0);
    t.equal(boolean(), true);

    // Parameterized values
    await parameterize(
      [
        [letter, "z"],
        [number, Number.MAX_VALUE],
      ],
      () => {
        t.equal(letter(), "z");
        t.equal(number(), Number.MAX_VALUE);
        t.equal(boolean(), true);
      }
    );

    // Initial values persists outside of parameterization
    t.equal(letter(), "a");
    t.equal(number(), 0);
    t.equal(boolean(), true);

    t.end();
  }
);

tap.test("parameterize returns the value of the given thunk", async (t) => {
  const prefix = makeParameter("# ");

  const result = await parameterize(
    [[prefix, "// "]],
    () => prefix() + "comment"
  );

  t.equal(result, "// comment");

  t.end();
});

tap.test("parameterize returns a Promise", async (t) => {
  const prefix = makeParameter("# ");

  const result = parameterize(
    [[prefix, "// "]],
    () => new Promise((resolve) => resolve(prefix() + "comment"))
  );

  t.ok(result instanceof Promise);
  t.equal(await result, "// comment");

  t.end();
});

tap.test(
  "parameterize throws when given an invalid parameter list",
  async (t) => {
    const param = makeParameter(null);

    await Promise.allSettled([
      t.rejects(parameterize({}, () => {})),
      t.rejects(parameterize([[]], () => {})),
      t.rejects(parameterize([[param]], () => {})),
      t.rejects(parameterize([[null, {}]], () => {})),
    ]);

    t.end();
  }
);

tap.test(
  "parameterize throws when second argument is not a thunk",
  async (t) => {
    const testValues = getTestValues({
      include: [(x) => x],
      typesToSkip: ["function"],
    });

    await Promise.allSettled(
      testValues.map((value) => t.rejects(parameterize([], value)))
    );

    t.end();
  }
);
