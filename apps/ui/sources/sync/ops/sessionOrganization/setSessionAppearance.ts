import type { AuthCredentials } from '@/auth/storage/tokenStorage';
import { setSessionAppearance as setSessionAppearanceApi } from '@/sync/api/session/sessionOrganizationApi';
import { parseSessionAppearanceColor, type SessionAppearanceColor } from '@/sync/domains/session/organization/appearanceColor';
import { getStorage } from '@/sync/domains/state/storageStore';
import { openSessionOrganizationDisplayEnvelope, prepareSessionOrganizationDisplayEnvelopeForWrite } from './sessionOrganizationDisplayEnvelope';

/** Set/clear a session override. Errors reject after rollback and follow the organization mutation error path. */
export async function setSessionAppearance(params: Readonly<{
    credentials: AuthCredentials;
    serverId: string;
    serverUrl?: string;
    sessionId: string;
    color: SessionAppearanceColor | null;
}>): Promise<void> {
    const color = parseSessionAppearanceColor(params.color);
    if (params.color !== null && !color) throw new Error('invalid-session-appearance');
    const appearance = color ? { sessionId: params.sessionId, display: { t: 'plain' as const, v: { color } }, updatedAt: Date.now() } : null;
    const recordId = getStorage().getState().setSessionAppearanceOptimistic(params.serverId, params.sessionId, appearance);
    try {
        const display = await prepareSessionOrganizationDisplayEnvelopeForWrite({ credentials: params.credentials, serverUrl: params.serverUrl, envelope: appearance?.display });
        const response = await setSessionAppearanceApi({ ...params, request: { display } });
        const opened = response.appearance ? await openSessionOrganizationDisplayEnvelope({ credentials: params.credentials, envelope: response.appearance.display }) : null;
        getStorage().getState().confirmSessionAppearanceOptimistic(recordId, params.sessionId,
            response.appearance && opened ? { ...response.appearance, display: opened } : null);
    } catch (error) {
        getStorage().getState().rollbackSessionOrganizationOptimistic(recordId);
        throw error;
    }
}
