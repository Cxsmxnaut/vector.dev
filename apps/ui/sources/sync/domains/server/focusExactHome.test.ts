import { beforeEach, describe, expect, it, vi } from 'vitest';

const { setActiveServerAndSwitch } = vi.hoisted(() => ({
    setActiveServerAndSwitch: vi.fn(),
}));

vi.mock('./activeServerSwitch', () => ({
    setActiveServerAndSwitch,
}));

import { focusExactHomeAndRefresh } from './focusExactHome';

describe('focusExactHomeAndRefresh', () => {
    beforeEach(() => {
        setActiveServerAndSwitch.mockReset();
    });

    it('reports an already-active refresh rejection as a blocked arrival', async () => {
        setActiveServerAndSwitch.mockResolvedValue('already_active');
        const refreshAuth = vi.fn().mockRejectedValue(new Error('refresh failed'));

        await expect(focusExactHomeAndRefresh({
            serverId: 'home-a',
            refreshAuth,
        })).resolves.toBe(false);

        expect(refreshAuth).toHaveBeenCalledTimes(1);
    });

    it('refreshes the committed credential when the exact Home is already focused', async () => {
        setActiveServerAndSwitch.mockResolvedValue('already_active');
        const refreshAuth = vi.fn(async () => {});

        await expect(focusExactHomeAndRefresh({
            serverId: 'home-a',
            refreshAuth,
        })).resolves.toBe(true);

        expect(refreshAuth).toHaveBeenCalledTimes(1);
    });
});
