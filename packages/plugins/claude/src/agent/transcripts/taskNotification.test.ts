import { describe, expect, it } from 'vitest';

import {
  CLAUDE_HANDBACK_REPORT,
  claudeAsyncAgentLaunchAck,
  claudeHandbackPointerNotification,
  claudeHandbackQueuedAttachment,
  claudeHandbackUserRow,
} from './peerMessage.testkit.js';
import { createClaudeTaskNotificationToolResultProjector } from './taskNotification.js';

const reportResult = { type: 'tool_result', tool_use_id: 'toolu_a1', content: [{ type: 'text', text: CLAUDE_HANDBACK_REPORT }], is_error: false };

describe('Claude task notification projector (subagent hand-backs)', () => {
  it.each([
    ['user row', claudeHandbackUserRow({ withReportText: false })],
    ['queued attachment', claudeHandbackQueuedAttachment()],
  ])('settles a correlated async Agent launch with its delivered report and absorbs the pointer notification (%s)', (_label, handback) => {
    const projector = createClaudeTaskNotificationToolResultProjector();
    expect(projector.project(claudeAsyncAgentLaunchAck({ toolUseId: 'toolu_a1' }))).toBeNull();
    expect(projector.project(handback)).toMatchObject({ type: 'user', uuid: 'handback',
      message: { role: 'user', content: [reportResult] } });
    expect(projector.project(claudeHandbackPointerNotification({ toolUseId: 'toolu_a1' }))).toBeNull();
  });

  it('leaves an unlinked hand-back to the peer message projection and keeps an ordinary completion', () => {
    const projector = createClaudeTaskNotificationToolResultProjector();
    expect(projector.project(claudeHandbackUserRow({ withReportText: true }))).toBeNull();
    projector.project(claudeAsyncAgentLaunchAck({ toolUseId: 'toolu_a1' }));
    expect(projector.project(claudeHandbackPointerNotification({ toolUseId: 'toolu_a1' }))).toMatchObject({
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_a1', is_error: false }] } });
  });

  it('forgets a delivered report when the agent is resumed so its next completion settles the new launch', () => {
    const projector = createClaudeTaskNotificationToolResultProjector();
    projector.project(claudeAsyncAgentLaunchAck({ toolUseId: 'toolu_a1' }));
    projector.project(claudeHandbackUserRow({ withReportText: true }));
    projector.project({ type: 'user', uuid: 'resume', toolUseResult: { resumedAgentId: 'a1' },
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_send', content: 'resumed' }] } });
    projector.project(claudeAsyncAgentLaunchAck({ toolUseId: 'toolu_a1_resumed', uuid: 'ack-2' }));
    expect(projector.project(claudeHandbackPointerNotification({ toolUseId: 'toolu_a1_resumed', uuid: 'pointer-2' }))).toMatchObject({
      message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_a1_resumed' }] } });
  });
});
