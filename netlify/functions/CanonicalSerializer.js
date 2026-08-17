export function canonicalize(obj) {
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
    // Exclude undefined to maintain canonical cleanliness
    if (value !== undefined) {
      canonicalObj[key] = canonicalize(value);
    }
  }

  return canonicalObj;
}

export function toCanonicalString(obj) {
  return JSON.stringify(canonicalize(obj));
}
