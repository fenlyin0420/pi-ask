export const OTHER_OPTION_VALUE = "__other__";
export const OTHER_OPTION_LABEL = "Type your own";
export const SUBMIT_CHOICES = ["Submit", "Elaborate", "Cancel"] as const;
export const SUBMIT_ACTION_COUNT = SUBMIT_CHOICES.length;
export const SUBMIT_NOTE_ROW_INDEX = SUBMIT_ACTION_COUNT;
export const SUBMIT_ROW_COUNT = SUBMIT_ACTION_COUNT + 1;
export const NO_PREVIEW_TEXT = "No preview available";
export const ELABORATION_INSTRUCTION =
	"First answer the user's noted clarification directly and concisely using the provided question and option context. Do not treat these notes as final answers. Then re-ask only the affected questions if a choice is still needed afterward. Do not jump straight to a follow-up question unless the note is already resolved.";
export const CANCELLED_SUMMARY = "User cancelled the ask flow";
export const SUBMITTED_SUMMARY = "User submitted the ask flow";
export const ELABORATED_SUMMARY = "User asked for elaboration based on notes";
export const CANCELLED_RESULT_TEXT = "Cancelled";
export const SUBMITTED_RESULT_TEXT = "Submitted";
export const ELABORATED_RESULT_TEXT = "Elaboration requested";
export const REMOTE_ASK_TIMEOUT_NOTICE =
	"No remote client answered ask_user in time. Ask these questions in plain text instead, or retry the tool call.";
