function canonicalize(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(canonicalize);
  }

  const sortedKeys = Object.keys(obj).sort();
  const canonicalObj = {};

  for (const key of sortedKeys) {
    const value = obj[key];
    if (value !== undefined) {
      canonicalObj[key] = canonicalize(value);
    }
  }

  return canonicalObj;
}

function toCanonicalString(obj) {
  return JSON.stringify(canonicalize(obj));
}

module.exports = {
  canonicalize,
  toCanonicalString
};
