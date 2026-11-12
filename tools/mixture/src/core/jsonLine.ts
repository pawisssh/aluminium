// How `planTypes.json` and `pickedBricks.json` write an object on one line, so a change diffs as one line.

/** A value as those files write it: JSON with a space after each comma and inside an object's braces, an object's fields in its own order. */
const jsonValue = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(jsonValue).join(', ')}]`
  if (value !== null && typeof value === 'object') return `{ ${jsonFields(value, Object.keys(value))} }`
  return JSON.stringify(value)
}

/** `"a": 1, "b": [1, 2]`: the fields of `object` named in `fields`, in that order, leaving out those it does not have. */
export function jsonFields(object: object, fields: readonly string[]): string {
  const values = object as Record<string, unknown>
  return fields
    .filter((field) => values[field] !== undefined)
    .map((field) => `${JSON.stringify(field)}: ${jsonValue(values[field])}`)
    .join(', ')
}

/** As `jsonFields`, but throws when `object` has a field that is not in `fields`, naming it and `what` the object is, so a writer cannot leave a new field out of its file silently. */
export function everyJsonField(object: object, fields: readonly string[], what: string): string {
  const unwritten = Object.keys(object).find((field) => !fields.includes(field))
  if (unwritten !== undefined) throw new Error(`${what} has a field the file does not write: ${JSON.stringify(unwritten)}. Add it to the fields its writer lists, in the file's order.`)
  return jsonFields(object, fields)
}
