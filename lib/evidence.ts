import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export function stringifyCanonical(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(item => stringifyCanonical(item)).join(',')}]`;
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys
    .filter(key => obj[key] !== undefined)
    .map(key => `"${key}":${stringifyCanonical(obj[key])}`);
  return `{${pairs.join(',')}}`;
}

interface CreateEvidenceParams {
  evidenceType: string;
  payload: any;
  sourceId?: string;
  runId?: string;
}

export async function createEvidence(params: CreateEvidenceParams) {
  const { evidenceType, payload, sourceId, runId } = params;

  const hashInput = {
    evidenceType,
    payload,
    runId: runId ?? null,
    sourceId: sourceId ?? null,
  };

  const canonicalStr = stringifyCanonical(hashInput);
  const sha256 = crypto.createHash('sha256').update(canonicalStr).digest('hex');

  const { data: evidence, error } = await supabaseAdmin
    .from('sys_evidence_items')
    .insert({
      evidence_type: evidenceType,
      type: evidenceType,          // 表裡同時有 type 欄位
      sha256: sha256,
      fingerprint: sha256,         // 表裡同時有 fingerprint 欄位
      content_json: payload,
      source_id: sourceId ?? null,
      run_id: runId ?? null,
      status: 'VALID',
      storage_path: 'system_registry',
      // created_by_user_id: NULL (service role, no user context)
      // state_version_id: NULL (not applicable for source registry ops)
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create evidence: ${error.message}`);
  }

  return { evidenceId: evidence.id, sha256 };
}