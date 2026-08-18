function canonicalize(value) {
  // Preserve primitives and null exactly as supplied.
  if (value === null || typeof value !== "object") {
    return value;
  }

  // Preserve array ordering.
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  // Recursively sort object keys.
  const sortedKeys = Object.keys(value).sort();

  const canonicalObject = {};

  for (const key of sortedKeys) {
    const childValue = value[key];

    // Undefined object properties are excluded because
    // JSON.stringify would omit them anyway.
    if (childValue !== undefined) {
      canonicalObject[key] = canonicalize(childValue);
    }
  }

  return canonicalObject;
}

/**
 * Convert a value into its deterministic canonical JSON representation.
 *
 * @param {*} value
 * @returns {string}
 */
function toCanonicalString(value) {
  return JSON.stringify(canonicalize(value));
}

/**
 * Compare two values using their canonical representations.
 *
 * Useful for deterministic equality checks without
 * depending on original object key ordering.
 *
 * @param {*} left
 * @param {*} right
 * @returns {boolean}
 */
function canonicalEqual(left, right) {
  return toCanonicalString(left) === toCanonicalString(right);
}

module.exports = {
  canonicalize,
  toCanonicalString,
  canonicalEqual
};
