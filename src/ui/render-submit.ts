import {
	type Editor,
	truncateToWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { UI_DIMENSIONS, UI_TEXT } from "../constants/ui.ts";
import type { AskState } from "../types.ts";
import {
	mergeColumns,
	pushSavedNote,
	pushWrappedText,
	renderEditorBlock,
} from "./render-helpers.ts";
import type { Theme } from "./render-types.ts";
import {
	buildReviewScreenModel,
	type ReviewNoteRowModel,
} from "./view-models/review.ts";

export function renderSubmitScreen(
	lines: string[],
	state: AskState,
	theme: Theme,
	width: number,
	reviewShortcutHint?: string,
	editor?: Editor
) {
	const model = buildReviewScreenModel(state, width);
	if (model.layout === "wide") {
		const rightWidth = Math.max(1, width - model.actionColumnWidth - 2);
		const reviewLines = renderSubmitReviewLines(model, theme, rightWidth);
		const actionLines = renderSubmitActions(
			model,
			theme,
			model.actionColumnWidth
		);
		for (const line of mergeColumns(
			actionLines,
			reviewLines,
			model.actionColumnWidth,
			width
		)) {
			lines.push(line);
		}
		lines.push("");
		appendOptionalNote(lines, model.note, theme, width, editor);
		appendReviewShortcutHint(lines, reviewShortcutHint, theme, width);
		return;
	}

	const reviewLines = renderSubmitReviewLines(model, theme, width);
	const actionLines = renderSubmitActions(model, theme, width);
	lines.push(...reviewLines);
	lines.push("");
	lines.push(...actionLines);
	lines.push("");
	appendOptionalNote(lines, model.note, theme, width, editor);
	appendReviewShortcutHint(lines, reviewShortcutHint, theme, width);
}

function renderSubmitReviewLines(
	model: ReturnType<typeof buildReviewScreenModel>,
	theme: Theme,
	width: number
): string[] {
	const lines: string[] = [];
	pushWrappedText(lines, UI_TEXT.reviewTitle, width, theme, "accent", " ", " ");
	lines.push("");

	for (const [index, question] of model.questions.entries()) {
		renderReviewQuestion(lines, question, theme, width);
		if (index < model.questions.length - 1) {
			lines.push("");
		}
	}

	return lines;
}

function renderReviewQuestion(
	lines: string[],
	question: ReturnType<typeof buildReviewScreenModel>["questions"][number],
	theme: Theme,
	width: number
) {
	pushWrappedText(lines, question.label, width, theme, "text", " ", " ");
	if (question.unanswered) {
		lines.push(
			truncateToWidth(`   ${theme.fg("dim", UI_TEXT.unanswered)}`, width)
		);
		return;
	}

	if (question.note) {
		pushSavedNote({
			lines,
			note: question.note,
			width,
			theme,
			indent: "     ",
		});
	}

	for (const selection of question.selections ?? []) {
		pushWrappedText(
			lines,
			`→ ${selection.label}`,
			width,
			theme,
			"success",
			"   ",
			"     "
		);
		if (selection.note) {
			pushSavedNote({
				lines,
				note: selection.note,
				width,
				theme,
				indent: "     ",
			});
		}
	}

	if (question.answerText) {
		pushWrappedText(
			lines,
			`→ ${question.answerText}`,
			width,
			theme,
			question.isCustomOnly ? "text" : "success",
			"   ",
			"     "
		);
	}

	for (const optionNote of question.extraOptionNotes ?? []) {
		pushSavedNote({
			lines,
			note: optionNote.note,
			width,
			theme,
			indent: "     ",
			label: optionNote.label,
		});
	}
}

function renderSubmitActions(
	model: ReturnType<typeof buildReviewScreenModel>,
	theme: Theme,
	width: number
): string[] {
	const lines: string[] = [];
	for (const [index, action] of model.actions.entries()) {
		const prefix = action.selected ? "❯ " : "  ";
		pushWrappedText(
			lines,
			`${index + 1}. ${action.label}`,
			width,
			theme,
			action.selected ? "accent" : "text",
			prefix,
			prefix
		);
	}
	return lines;
}

function appendOptionalNote(
	lines: string[],
	note: ReviewNoteRowModel,
	theme: Theme,
	width: number,
	editor: Editor | undefined
) {
	const pointer = note.focused ? "❯ " : "  ";
	if (note.editing && editor) {
		lines.push(
			truncateToWidth(
				`${pointer}${theme.fg("accent", UI_TEXT.optionalNoteTitle)}`,
				width
			)
		);
		renderEditorBlock({
			lines,
			editorLines: editor.render(
				Math.max(
					UI_DIMENSIONS.editorMinWidth,
					width - UI_DIMENSIONS.editorContentPadding
				)
			),
			width,
			theme,
			indent: "  ",
			availableWidth: width - 2,
			placeholder: UI_TEXT.editorPlaceholderOptionalNote,
			isEmpty: editor.getText().length === 0,
		});
		return;
	}

	const text = `${theme.fg("accent", UI_TEXT.optionalNoteTitle)}${theme.fg(
		note.text ? "text" : "muted",
		` ${note.text ?? emptyNoteText(note)}`
	)}`;
	const wrapped = wrapTextWithAnsi(text, Math.max(1, width - 2));
	for (const [index, line] of wrapped.entries()) {
		lines.push(
			truncateToWidth(`${index === 0 ? pointer : "  "}${line}`, width)
		);
	}
}

function emptyNoteText(note: ReviewNoteRowModel): string {
	return note.focused ? UI_TEXT.optionalNoteHint : UI_TEXT.optionalNoteIdle;
}

function appendReviewShortcutHint(
	lines: string[],
	hint: string | undefined,
	theme: Theme,
	width: number
) {
	if (!hint) {
		return;
	}
	lines.push("");
	pushWrappedText(lines, hint, width, theme, "dim", " ", " ");
}
