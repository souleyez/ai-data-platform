import { loadModelConfigState } from './model-config-runtime.js';
import { updateCanonicalPrimaryModel } from './model-config-actions-support.js';

export async function updateSelectedModel(modelId: string) {
  await updateCanonicalPrimaryModel(modelId);
  return loadModelConfigState();
}
