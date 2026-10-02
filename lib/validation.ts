/** JSON 边界校验；只接受当前结构，不转换字段或补齐记录。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function hasFields(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
}

export function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9]+(?:[-_][a-zA-Z0-9]+)*$/.test(value)
}

export function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 &&
    value === value.trim() && !/[\u0000-\u001f\u200b\u00a0]/.test(value)
}

export function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.includes(value as T)
}
