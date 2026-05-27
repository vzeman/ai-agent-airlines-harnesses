export class ManualInterventionRequired extends Error {
  readonly diagnostics: Record<string, unknown>;

  constructor(message: string, diagnostics: Record<string, unknown> = {}) {
    super(message);
    this.name = "ManualInterventionRequired";
    this.diagnostics = diagnostics;
  }
}
