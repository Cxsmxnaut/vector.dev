import * as React from 'react';
import { View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';

import { renderScreen } from '@/dev/testkit';

import { slideTransitionTokens } from './slideTransitionTokens';

vi.mock('react-native', async () => {
    const { createReactNativeWebMock } = await import('@/dev/testkit/mocks/reactNative');
    return createReactNativeWebMock();
});

function flattenStyle(style: unknown): Record<string, unknown> {
    if (!style) return {};
    if (Array.isArray(style)) {
        return style.reduce<Record<string, unknown>>((acc, entry) => ({
            ...acc,
            ...flattenStyle(entry),
        }), {});
    }
    return typeof style === 'object' ? style as Record<string, unknown> : {};
}

describe('StepTransitionFrame', () => {
    it('renders the step body on the routine role', async () => {
        const { StepTransitionFrame } = await import('./StepTransitionFrame');
        const screen = await renderScreen(
            <StepTransitionFrame transitionKey="one" direction="replace" testID="step-frame">
                <View testID="step-one" />
            </StepTransitionFrame>,
        );

        await screen.update(
            <StepTransitionFrame transitionKey="two" direction="replace" testID="step-frame">
                <View testID="step-two" />
            </StepTransitionFrame>,
        );

        const routine = slideTransitionTokens.routine.timed;
        expect(screen.findByTestId('step-two')).not.toBeNull();
        expect(flattenStyle(screen.findByTestId('step-frame-current-layer')?.props.style)).toMatchObject({
            transitionDuration: `${routine.durationMs.enter}ms`,
            filter: `blur(${routine.blurPx}px)`,
        });
    });
});
