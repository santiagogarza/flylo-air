import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LAKELINE_POLICY = 'src/scenarios/lakeline/hardship-policy.md';

export function readScenarioFile(relative: string): string | null {
  if (relative !== LAKELINE_POLICY) return null;
  try {
    return readFileSync(join(process.cwd(), 'src/scenarios/lakeline/hardship-policy.md'), 'utf8');
  } catch {
    return null;
  }
}
