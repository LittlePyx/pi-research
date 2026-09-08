import { getApiUser, getDatabase } from '../../../../db/repository';
import { paperDiagnosticResponse } from '../../../../lib/paper-diagnostic-response.mjs';

export async function GET(request: Request) {
  return paperDiagnosticResponse(request, getApiUser, getDatabase);
}
