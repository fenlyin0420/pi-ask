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

function stateWithNote(): AskState {
	let state = submitTabState();
	state = { ...state, activeSubmitActionIndex: 3 };
	state = confirmCurrentSelection(state);
	return saveNote(state, "Prefer a light blue accent");
}

test("review tab exposes the optional note row after the submit actions", () => {
	let state = submitTabState();
	state = moveOption(state, 1);
	state = moveOption(state, 1);
	state = moveOption(state, 1);

	assert.equal(state.activeSubmitActionIndex, 3);

	const next = confirmCurrentSelection(state);
	assert.deepEqual(next.view, { kind: "askNote" });
	assert.equal(next.completed, false);
	assert.equal(next.cancelled, false);
});

test("saving an optional note stores it without completing the ask flow", () => {
	const state = saveNote(enterAskNoteMode(submitTabState()), "  add tests  ");

	assert.equal(state.note, "  add tests  ");
	assert.deepEqual(state.view, { kind: "submit" });
	assert.equal(state.completed, false);
	assert.equal(getEditorDraft(enterAskNoteMode(state)), "  add tests  ");
});

test("saving a blank optional note clears it", () => {
	const filled = stateWithNote();
	const cleared = saveNote(enterAskNoteMode(filled), "   ");

	assert.equal(cleared.note, undefined);
	assert.deepEqual(cleared.view, { kind: "submit" });
});

test("optional notes are serialized and rendered with submitted results", () => {
	const state = stateWithNote();
	const result = toAskResult(state);

	assert.equal(result.note, "Prefer a light blue accent");
	assert.equal(
		summarizeResult(result),
		"Color: Blue\nOptional note: Prefer a light blue accent"
	);
	assert.equal(
		renderResultText(result),
		"✓ Color: Blue\n  optional note: Prefer a light blue accent"
	);
});

test("optional notes are surfaced on elaborate results", () => {
	const state = stateWithNote();
	const result = toAskResult({
		...state,
		activeSubmitActionIndex: 1,
		completed: true,
		mode: "elaborate",
	});

	assert.equal(
		renderResultText(result),
		'User asked to elaborate on question "Pick one color." after current answer "Blue"\nUser added an optional note: "Prefer a light blue accent"'
	);
});

test("optional notes count as dirty flow state", () => {
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

test("saved optional notes block auto submit", () => {
	const config: AskConfig = {
		...DEFAULT_ASK_CONFIG,
		behaviour: {
			...DEFAULT_ASK_CONFIG.behaviour,
			autoSubmitWhenAnsweredWithoutNotes: true,
		},
	};

	assert.equal(shouldAutoSubmit(submitTabState(), config), true);
	assert.equal(shouldAutoSubmit(stateWithNote(), config), false);
});

test("review tab renders the saved optional note and focuses the row", () => {
	const state = {
		...stateWithNote(),
		activeSubmitActionIndex: 3,
	};
	const lines: string[] = [];
	renderSubmitScreen(lines, state, plainTheme(), 100);

	assert(
		lines.some((line) =>
			line.includes("❯ Optional note: Prefer a light blue accent")
		)
	);
});

test("review tab hints how to open the focused optional note row", () => {
	const state = { ...submitTabState(), activeSubmitActionIndex: 3 };
	const lines: string[] = [];
	renderSubmitScreen(lines, state, plainTheme(), 100);

	assert(
		lines.some((line) =>
			line.includes("❯ Optional note: optional — press Enter to type")
		)
	);
});

test("review tab renders the optional note editor in place of the row text", () => {
	const editor = {
		getText: () => "draft",
		render: () => ["┌──────┐", "┌──────┐"],
	};
	const lines: string[] = [];
	renderSubmitScreen(
		lines,
		enterAskNoteMode(stateWithNote()),
		plainTheme(),
		100,
		undefined,
		editor as never
	);

	assert(lines.includes("❯ Optional note:"));
});
