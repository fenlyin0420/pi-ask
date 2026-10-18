import assert from "node:assert/strict";
import test from "node:test";
import { registerAskTool } from "../src/ask-tool.ts";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import { getAskConfigStore } from "../src/config/store.ts";
import { REMOTE_ASK_TIMEOUT_NOTICE } from "../src/constants/text.ts";
import {
	createRemoteAskRuntime,
	PI_ASK_COMPLETED_EVENT,
	PI_ASK_STARTED_EVENT,
	PI_ASK_SUBMIT_EVENT,
	PI_ASK_SUBMIT_RESULT_EVENT,
	type RemoteAskCompletedEvent,
	type RemoteAskStartedEvent,
	type RemoteAskSubmitResultEvent,
} from "../src/remote-ask.ts";
import type { AskParams } from "../src/types.ts";

const NON_INTERACTIVE_MESSAGE_RE = /requires interactive TUI mode/;
const SPEED_OPTION_RE = /\[speed\]/;
const APPENDED_NOTE_RE = /User added: "also update the changelog"/;
const HAS_UI = "hasUI";

class TestEventBus {
	readonly events: Array<{ channel: string; data: unknown }> = [];
	private readonly handlers = new Map<string, Array<(data: unknown) => void>>();

	emit(channel: string, data: unknown): void {
		this.events.push({ channel, data });
		for (const handler of this.handlers.get(channel) ?? []) {
			handler(data);
		}
	}

	on(channel: string, handler: (data: unknown) => void): () => void {
		const handlers = this.handlers.get(channel) ?? [];
		handlers.push(handler);
		this.handlers.set(channel, handlers);
		return () => {
			this.handlers.set(
				channel,
				(this.handlers.get(channel) ?? []).filter(
					(candidate) => candidate !== handler
				)
			);
		};
	}

	started(): RemoteAskStartedEvent | undefined {
		return this.events.find((event) => event.channel === PI_ASK_STARTED_EVENT)
			?.data as RemoteAskStartedEvent | undefined;
	}

	completed(): RemoteAskCompletedEvent | undefined {
		return this.events.find((event) => event.channel === PI_ASK_COMPLETED_EVENT)
			?.data as RemoteAskCompletedEvent | undefined;
	}

	submitResults(): RemoteAskSubmitResultEvent[] {
		return this.events
			.filter((event) => event.channel === PI_ASK_SUBMIT_RESULT_EVENT)
			.map((event) => event.data as RemoteAskSubmitResultEvent);
	}
}

function registerToolWithRemote(bus: TestEventBus) {
	const tools: Record<string, unknown>[] = [];
	registerAskTool(
		{
			appendEntry() {
				// no-op: the payload store is not under test here
			},
			registerTool(tool: unknown) {
				tools.push(tool as Record<string, unknown>);
			},
		} as never,
		createRemoteAskRuntime(bus as never)
	);
	return tools[0] as {
		execute: (
			id: string,
			params: unknown,
			signal: AbortSignal | undefined,
			onUpdate: unknown,
			ctx: unknown
		) => Promise<{
			content: Array<{ text: string }>;
			details: { answers: Record<string, { values: string[] }> };
		}>;
	};
}

function sampleParams(): AskParams {
	return {
		title: "Clarify next step",
		questions: [
			{
				id: "goal",
				label: "Goal",
				prompt: "What should I optimize for?",
				options: [
					{ value: "speed", label: "Speed" },
					{ value: "safety", label: "Safety" },
				],
			},
		],
	};
}

/** Remote dispatch happens on an event tick; let the flow publish `started`. */
function tick(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function rpcCtx(notifications: string[] = []) {
	return {
		mode: "rpc",
		[HAS_UI]: true,
		ui: {
			notify(message: string) {
				notifications.push(message);
			},
			setWorkingVisible() {
				// no-op
			},
		},
	};
}

function answerSubmit(flowId: string, value: string) {
	return {
		version: 1,
		requestId: "request-1",
		flowId,
		response: {
			kind: "answer",
			answers: { goal: { values: [value] } },
		},
	};
}

function elaborateSubmit(flowId: string, note: string) {
	return {
		version: 1,
		requestId: "request-1",
		flowId,
		response: {
			kind: "answer",
			mode: "elaborate",
			answers: { goal: { values: ["speed"] } },
			note,
		},
	};
}

test("rpc mode answers ask_user through the remote flow instead of the text fallback", async () => {
	getAskConfigStore().setConfig({
		...DEFAULT_ASK_CONFIG,
		notifications: { ...DEFAULT_ASK_CONFIG.notifications, enabled: false },
	});
	const bus = new TestEventBus();
	const tool = registerToolWithRemote(bus);

	const pending = tool.execute(
		"call-1",
		sampleParams(),
		undefined,
		undefined,
		rpcCtx()
	);
	await tick();

	const started = bus.started();
	assert.ok(started, "a remote flow should surface the questions");
	assert.equal(started.flowId, "tool:call-1");
	assert.deepEqual(
		started.questions.map((question) => question.id),
		["goal"]
	);

	bus.emit(PI_ASK_SUBMIT_EVENT, answerSubmit(started.flowId, "speed"));
	const result = await pending;

	assert.equal(
		result.content[0]?.text.includes("interactive TUI"),
		false,
		"the answered flow must not fall back to the non-interactive message"
	);
	assert.deepEqual(result.details.answers.goal?.values, ["speed"]);
	assert.equal(bus.completed()?.result.cancelled, false);
	assert.deepEqual(bus.submitResults(), [
		{ version: 1, requestId: "request-1", flowId: "tool:call-1", ok: true },
	]);

	getAskConfigStore().setConfig(DEFAULT_ASK_CONFIG);
});

test("a remote whole-ask note on an elaborate submit reaches the agent", async () => {
	getAskConfigStore().setConfig({
		...DEFAULT_ASK_CONFIG,
		notifications: { ...DEFAULT_ASK_CONFIG.notifications, enabled: false },
	});
	const bus = new TestEventBus();
	const tool = registerToolWithRemote(bus);

	const pending = tool.execute(
		"call-1",
		sampleParams(),
		undefined,
		undefined,
		rpcCtx()
	);
	await tick();
	const flowId = bus.started()?.flowId ?? "";

	bus.emit(
		PI_ASK_SUBMIT_EVENT,
		elaborateSubmit(flowId, "also update the changelog")
	);
	const result = await pending;

	assert.match(result.content[0]?.text ?? "", APPENDED_NOTE_RE);
	assert.equal(bus.completed()?.result.note, "also update the changelog");

	getAskConfigStore().setConfig(DEFAULT_ASK_CONFIG);
});

test("rpc mode without a remote runtime keeps the non-interactive fallback", async () => {
	const tools: Record<string, unknown>[] = [];
	registerAskTool({
		appendEntry() {
			// no-op
		},
		registerTool(tool: unknown) {
			tools.push(tool as Record<string, unknown>);
		},
	} as never);
	const tool = tools[0] as {
		execute: (
			id: string,
			params: unknown,
			signal: unknown,
			onUpdate: unknown,
			ctx: unknown
		) => Promise<{ content: Array<{ text: string }> }>;
	};

	const result = await tool.execute(
		"call-1",
		sampleParams(),
		undefined,
		undefined,
		rpcCtx()
	);

	assert.match(result.content[0]?.text ?? "", NON_INTERACTIVE_MESSAGE_RE);
});

test("a rejected remote answer keeps the flow open for a corrected retry", async () => {
	getAskConfigStore().setConfig({
		...DEFAULT_ASK_CONFIG,
		notifications: { ...DEFAULT_ASK_CONFIG.notifications, enabled: false },
	});
	const bus = new TestEventBus();
	const tool = registerToolWithRemote(bus);

	const pending = tool.execute(
		"call-1",
		sampleParams(),
		undefined,
		undefined,
		rpcCtx()
	);
	await tick();
	const flowId = bus.started()?.flowId ?? "";

	bus.emit(PI_ASK_SUBMIT_EVENT, answerSubmit(flowId, "unknown-value"));
	assert.equal(
		bus.completed(),
		undefined,
		"an invalid answer must not end the flow"
	);
	assert.equal(bus.submitResults()[0]?.ok, false);

	bus.emit(PI_ASK_SUBMIT_EVENT, answerSubmit(flowId, "safety"));
	const result = await pending;

	assert.deepEqual(result.details.answers.goal?.values, ["safety"]);
	assert.equal(bus.completed()?.result.cancelled, false);

	getAskConfigStore().setConfig(DEFAULT_ASK_CONFIG);
});

test("an unanswered rpc flow expires into the non-interactive fallback", async () => {
	const previous = process.env.PI_ASK_REMOTE_TIMEOUT_MS;
	process.env.PI_ASK_REMOTE_TIMEOUT_MS = "20";
	const bus = new TestEventBus();
	const notifications: string[] = [];
	const tool = registerToolWithRemote(bus);

	try {
		const result = await tool.execute(
			"call-1",
			sampleParams(),
			undefined,
			undefined,
			rpcCtx(notifications)
		);

		assert.ok(
			result.content[0]?.text.startsWith(REMOTE_ASK_TIMEOUT_NOTICE),
			`expected the timeout notice, got: ${result.content[0]?.text}`
		);
		assert.match(result.content[0]?.text ?? "", SPEED_OPTION_RE);
		assert.deepEqual(notifications, [REMOTE_ASK_TIMEOUT_NOTICE]);
		assert.equal(
			bus.completed()?.result.cancelled,
			true,
			"expiry must release the flow so a late answer cannot resolve it"
		);
	} finally {
		if (previous === undefined) {
			delete process.env.PI_ASK_REMOTE_TIMEOUT_MS;
		} else {
			process.env.PI_ASK_REMOTE_TIMEOUT_MS = previous;
		}
	}
});
