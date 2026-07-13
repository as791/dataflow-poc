export type Stage = 'draft' | 'testing' | 'production' | 'archived';

const STAGE_LABEL: Record<Stage, string> = {
  draft: 'Draft', testing: 'Integration', production: 'Production', archived: 'Archived',
};
const ENV_LABEL: Record<string, string> = { test: 'Integration', prod: 'Production' };

export function displayStage(stage: Stage) { return STAGE_LABEL[stage]; }
export function displayEnvironment(environment?: string) {
  return environment ? (ENV_LABEL[environment] ?? environment) : 'Integration';
}
export function deriveStage(status?: string, environment?: string): Stage {
  if (status === 'active' && environment === 'prod') return 'production';
  if (status === 'active' && environment === 'test') return 'testing';
  if (status === 'archived') return 'archived';
  return 'draft';
}
