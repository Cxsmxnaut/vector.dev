import { describe, expect, it } from 'vitest';

import type { TranscriptNavigationAnchorCandidate } from './deriveCurrentTranscriptAnchor';
import { resolveRetainedTranscriptNavigationLandedAnchor } from './transcriptNavigationLandedAnchor';

const ANCHORS: readonly TranscriptNavigationAnchorCandidate[] = [
    { id: 'turn-1', kind: 'user-turn', sourceIndex: 1 },
    { id: 'turn-2', kind: 'user-turn', sourceIndex: 9 },
];

const LANDED = { anchorId: 'turn-2', sessionId: 'session-1' } as const;

describe('resolveRetainedTranscriptNavigationLandedAnchor', () => {
    it('releases a landing inherited from another session', () => {
        expect(resolveRetainedTranscriptNavigationLandedAnchor({
            anchors: ANCHORS,
            genuineUserMovement: false,
            landed: LANDED,
            sessionId: 'session-2',
        })).toBeNull();
    });

    it('has nothing to retain without a landing', () => {
        expect(resolveRetainedTranscriptNavigationLandedAnchor({
            anchors: ANCHORS,
            genuineUserMovement: false,
            landed: null,
            sessionId: 'session-1',
        })).toBeNull();
    });
});
