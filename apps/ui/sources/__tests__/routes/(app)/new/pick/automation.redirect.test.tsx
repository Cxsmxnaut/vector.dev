import * as React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderScreen, standardCleanup } from '@/dev/testkit';
import { resolveHref } from 'expo-router/build/link/href';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('expo-router', async () => {
    const { createExpoRouterMock } = await import('@/dev/testkit/mocks/router');
    return createExpoRouterMock().module;
});

describe('legacy automation picker route', () => {
    afterEach(() => {
        standardCleanup();
    });

    it('reaches canonical Workflow authoring instead of a second inline authoring surface', async () => {
        const module = await import('@/app/(app)/new/pick/automation');
        const screen = await renderScreen(React.createElement(module.default));

        const redirect = screen.findByType('Redirect' as any);
        // The old destination forced New Session into an Automation entry and
        // manufactured a fresh inline draft that reached the retained one-shot
        // writer directly, bypassing the trigger editor and its save owner.
        // The exact href also proves no prompt, setting or draft rides along.
        expect(resolveHref(redirect.props.href)).toBe('/workflows/new');
    });
});
