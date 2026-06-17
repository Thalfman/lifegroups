// Next.js `searchParams` values are `string | string[] | undefined`: a repeated
// query key (`?tab=a&tab=b`) arrives as an array. This collapses that to the
// first value, matching the `Array.isArray(v) ? v[0] : v` idiom repeated across
// the page guards.
export function firstParam<T>(value: T | T[] | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value;
}
