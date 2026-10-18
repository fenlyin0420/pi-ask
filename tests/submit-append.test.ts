import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ASK_CONFIG } from "../src/config/defaults.ts";
import type { AskConfig } from "../src/config/schema.ts";
import { renderResultText } from "../src/result.ts";
import { createInitialState } from "../src/state/create.ts";
import { getEditorDraft } from "../src/state/editor.ts";
import { summarizeResult, toAskResult } from "../src/state/result.ts";
import {
	applyNumberShortcut,
	confirmCurrentSelection,
	enterAskNoteMode,
	moveOption,
	moveTab,
	saveNote,
} from "../src/state/transitions.ts";
import type { AskState } from "../src/types.ts";
import { shouldAutoSubmit } from "../src/ui/auto-submit.ts";
import { hasDirtyFlowState } from "../src/ui/dismiss-guard.ts";
import { renderSubmitScreen } from "../src/ui/render-submit.ts";

function plainTheme() {
	return {
		fg(_color: string, text: string) {
			return text;
		},
		bg(_color: string, text: string) {
			return text;
		},
		bold(text: string) {
			return text;
		},
	} as never;
}

function submitTabState(): AskState {
	let state = createInitialState({
		questions: [
			{
				id: "color",
				label: "Color",
				prompt: "Pick one color.",
				options: [{ value: "blue", label: "Blue" }],
			},
		],
	});
	state = applyNumberShortcut(state, 1);
	return state;
}

function elaborateEditorState(): AskState {
	return confirmCurrentSelection(moveOption(submitTabState(), 1));
}

function submittedWithAppend(text: string): AskState {
	return saveNote(elaborateEditorState(), text, true);
}

test("review tab exposes only submit, elaborate, and cancel", () => {
	let state = submitTabState();
	for (let step = 0; step < 4; step++) {
		state = moveOption(state, 1);
	}

	assert.equal(state.activeSubmitActionIndex, 2);
});

test("choosing elaborate opens the inline editor without leaving submit mode", () => {
	const state = elaborateEditorState();

	assert.deepEqual(state.view, { kind: "askNote" });
	assert.equal(state.completed, false);
	assert.equal(state.cancelled, false);
	assert.equal(state.mode, "submit");
});

test("saving the inline input completes the ask with the text appended", () => {
	const state = submittedWithAppend("also cover the CLI flag");

	assert.equal(state.completed, true);
	assert.equal(state.cancelled, false);
	assert.equal(state.mode, "submit");
	assert.equal(state.note, "also cover the CLI flag");
	assert.deepEqual(
		state.answers.color?.selected.map((selection) => selection.value),
		["blue"]
	);
});

test("appended text leaves the committed answers untouched in the result", () => {
	const result = toAskResult(submittedWithAppend("also cover the CLI flag"));

	assert.deepEqual(result.answers.color?.values, ["blue"]);
	assert.deepEqual(result.answers.color?.labels, ["Blue"]);
	assert.deepEqual(result.answers.color?.indices, [1]);
	assert.equal(result.note, "also cover the CLI flag");
	assert.equal(
		summarizeResult(result),
		"Color: Blue\nUser added: also cover the CLI flag"
	);
	assert.equal(
		renderResultText(result),
		"✓ Color: Blue\n  added: also cover the CLI flag"
	);
});

test("closing the inline editor keeps the text as a draft", () => {
	const state = saveNote(elaborateEditorState(), "draft thought");

	assert.deepEqual(state.view, { kind: "submit" });
	assert.equal(state.completed, false);
	assert.equal(state.cancelled, false);
	assert.equal(state.note, "draft thought");
	assert.equal(getEditorDraft(enterAskNoteMode(state)), "draft thought");
});

test("saving a blank inline input submits without appended text", () => {
	const state = submittedWithAppend("   ");

	assert.equal(state.completed, true);
	assert.equal(state.note, undefined);
	assert.equal(summarizeResult(toAskResult(state)), "Color: Blue");
});

test("appended text is surfaced on remote elaborate results", () => {
	const state = submittedWithAppend("Prefer a light blue accent");
	const result = toAskResult({
		...state,
		completed: true,
		mode: "elaborate",
	});

	assert.equal(
		renderResultText(result),
		'User asked to elaborate on question "Pick one color." after current answer "Blue"\nUser added: "Prefer a light blue accent"'
	);
});

test("appended text counts as dirty flow state", () => {
	const empty = moveTab(
		createInitialState({
			questions: [
				{
					id: "color",
					label: "Color",
					prompt: "Pick one color.",
					options: [{ value: "blue", label: "Blue" }],
				},
			],
		}),
		-1
	);

	assert.equal(hasDirtyFlowState(empty), false);
	assert.equal(hasDirtyFlowState({ ...empty, note: "anything else" }), true);
});

test("appended text blocks auto submit", () => {
	const config: AskConfig = {
		...DEFAULT_ASK_CONFIG,
		behaviour: {
			...DEFAULT_ASK_CONFIG.behaviour,
			autoSubmitWhenAnsweredWithoutNotes: true,
		},
	};

	assert.equal(shouldAutoSubmit(submitTabState(), config), true);
	assert.equal(
		shouldAutoSubmit(saveNote(elaborateEditorState(), "draft"), config),
		false
	);
});

test("review tab opens the inline editor under the elaborate row", () => {
	const editor = {
		getText: () => "",
		render: () => [],
	};
	const state = elaborateEditorState();
	const lines: string[] = [];
	renderSubmitScreen(
		lines,
		state,
		plainTheme(),
		60,
		undefined,
		editor as never
	);

	const actionIndex = lines.findIndex((line) => line.includes("2. Elaborate"));
	assert.notEqual(actionIndex, -1);
	assert.equal(lines[actionIndex + 1]?.trim(), "Type answer...");
	assert.equal(lines[actionIndex + 2], "  3. Cancel");
});

test("review tab shows appended text under the elaborate row", () => {
	const state = saveNote(elaborateEditorState(), "Prefer a light blue accent");
	const lines: string[] = [];
	renderSubmitScreen(lines, state, plainTheme(), 60);

	const actionIndex = lines.findIndex((line) => line.includes("2. Elaborate"));
	const textIndex = lines.findIndex((line) =>
		line.includes("Prefer a light blue accent")
	);
	assert.notEqual(actionIndex, -1);
	assert.equal(textIndex, actionIndex + 1);
	assert.equal(lines[textIndex]?.startsWith("     "), true);
});
