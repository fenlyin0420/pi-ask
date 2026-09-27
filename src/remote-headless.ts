/**
 * Headless remote ask flow.
 *
 * The interactive flow in `ui/controller.ts` is built on `ctx.ui.custom` — a
 * desktop TUI component — so it can only exist in `tui` mode. Hosts that are
 * not a terminal but still have a human behind a transport (notably a
 * `pi --mode rpc` child whose remote bridge mirrors interactive frames to a
 * paired app) have no way to answer through the TUI path.
 *
 * They do have a transport: pi-ask's own event contract
 * (`docs/remote-events.md`). This module drives it with no UI at all — start a
 * remote flow, wait for one submit or cancel, return an outcome. A remote
 * answer is terminal by design: `elaborate` ends the flow as an elaboration
 * request, exactly like submitting in the TUI.
 */

import type {
	RemoteAskResponse,
	RemoteAskSubmitResolution,
} from "./remote-ask.ts";
import { applyRemoteAskResponse } from "./remote-ask.ts";
import { createInitialState } from "./state/create.ts";
import { toAskResult } from "./state/result.ts";
import type { AskParams, AskResult, AskState } from "./types.ts";
import type { AskFlowOptions } from "./ui/controller.ts";

/**
 * How long a headless flow waits for a remote answer before it gives up.
 *
 * A TUI flow can wait forever: the dialog is on screen and the user can always
 * press esc. A headless flow has no such escape hatch, so an unattended phone
 * would otherwise park the agent's turn indefinitely. The default matches the
 * remote bridge's own flow TTL (remote-pi drops an unanswered flow after ten
 * minutes), so both sides expire together.
 */
export const DEFAULT_REMOTE_ASK_TIMEOUT_MS = 10 * 60 * 1000;

/** Env override, mostly for tests and for hosts that want a tighter bound. */
const TIMEOUT_ENV = "PI_ASK_REMOTE_TIMEOUT_MS";

export type RemoteAskOutcome =
	| { kind: "answered"; result: AskResult }
	| { kind: "cancelled"; result: AskResult }
	| { kind: "expired"; result: AskResult };

export interface RemoteHeadlessAskOptions {
	presentSingleAsMulti?: boolean;
	remote: NonNullable<AskFlowOptions["remote"]>;
	timeoutMs?: number;
}

export function remoteAskTimeoutMs(): number {
	const raw = process.env[TIMEOUT_ENV];
	if (!raw) {
		return DEFAULT_REMOTE_ASK_TIMEOUT_MS;
	}
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0
		? parsed
		: DEFAULT_REMOTE_ASK_TIMEOUT_MS;
}

export function runRemoteAskFlow(
	params: AskParams,
	options: RemoteHeadlessAskOptions,
	signal?: AbortSignal
): Promise<RemoteAskOutcome> {
	let state = createInitialState(params, {
		presentSingleAsMulti: options.presentSingleAsMulti,
	});

	return new Promise<RemoteAskOutcome>((resolve) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const settle = (outcome: RemoteAskOutcome) => {
			if (settled) {
				return;
			}
			settled = true;
			if (timer !== undefined) {
				clearTimeout(timer);
			}
			signal?.removeEventListener("abort", onAbort);
			// `complete` dismisses any client modal and releases the flow id, so
			// a late submit is answered with `flow_not_found` instead of being
			// silently swallowed.
			flow.complete(outcome.result);
			resolve(outcome);
		};

		// A rejected answer keeps the flow open: the transport already reports
		// the failure back to the submitting client, which can correct and retry.
		const onSubmit = (
			response: RemoteAskResponse
		): RemoteAskSubmitResolution => {
			const resolution = applyRemoteAskResponse(state, response);
			if (!resolution.ok) {
				return resolution;
			}
			state = resolution.state;
			settle({
				kind: state.cancelled ? "cancelled" : "answered",
				result: toAskResult(state),
			});
			return { ok: true };
		};

		const flow = options.remote.runtime.startFlow({
			source: options.remote.source,
			toolCallId: options.remote.toolCallId,
			title: state.title,
			questions: state.questions,
			onSubmit,
		});

		function onAbort() {
			settle({ kind: "cancelled", result: cancelledResult(state) });
		}

		timer = setTimeout(
			() => settle({ kind: "expired", result: cancelledResult(state) }),
			options.timeoutMs ?? remoteAskTimeoutMs()
		);
		// Do not hold the event loop open for a question nobody may answer.
		timer.unref?.();

		signal?.addEventListener("abort", onAbort, { once: true });
		if (signal?.aborted) {
			onAbort();
		}
	});
}

function cancelledResult(state: AskState): AskResult {
	return { ...toAskResult(state), cancelled: true };
}
