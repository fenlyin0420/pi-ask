import type { AskConfig } from "../config/schema.ts";
import { hasAnswerNotes } from "../state/answers.ts";
import { isQuestionAnswered, isSubmitTab } from "../state/selectors.ts";
import { isEditingView } from "../state/view.ts";
import type { AskState } from "../types.ts";

export function maybeAutoSubmitState(
	state: AskState,
	config: AskConfig
): AskState {
	if (!shouldAutoSubmit(state, config)) {
		return state;
	}
	return {
		...state,
		completed: true,
		mode: "submit",
	};
}

export function shouldAutoSubmit(state: AskState, config: AskConfig): boolean {
	if (!config.behaviour.autoSubmitWhenAnsweredWithoutNotes) {
		return false;
	}
	if (state.completed || state.cancelled || !isSubmitTab(state)) {
		return false;
	}
	if (isEditingView(state)) {
		return false;
	}
	if (state.note) {
		return false;
	}
	for (const question of state.questions) {
		if (!isQuestionAnswered(state, question.id)) {
			return false;
		}
		if (hasAnswerNotes(state.answers[question.id])) {
			return false;
		}
	}
	return true;
}
