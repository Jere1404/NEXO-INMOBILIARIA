import { createClient } from '../../vendor/supabase-js.js';
import { createBackendClient } from '../backend/client.js';
import { authConfig } from '../../../admin/config.js';
import { recoveryRedirect } from './auth-flow.js';

export function getAdminClient() {
  recoveryRedirect(authConfig.siteUrl);
  return createBackendClient(createClient, {url:authConfig.supabaseUrl,publishableKey:authConfig.publishableKey},window.sessionStorage);
}
export { authConfig };
