/** Строка аудита не раскрывает пользовательский источник волн из аргументов CLI. */
export function auditableCommandLine(args: string[]): string {
  return ["lito", ...args.map((arg, index) =>
    args[index - 1] === "--wave-source" ? "[источник скрыт]" : arg)].join(" ");
}

/** Убирает заявленные приватные источники из сохраняемого журнала выполнения. */
export function redactExecutionLog(log: string, values: string[]): string {
  return values.filter(Boolean).reduce((current, value) =>
    current.replaceAll(value, "[источник скрыт]"), log);
}
