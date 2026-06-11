# Telemetry & User Feedback

VocabMaster includes built-in telemetry and user feedback mechanisms to monitor app usage, track word mastery, and gather data for AI prompt tuning.

## 1. AnalyticsService (`analytics.js`)
Tracks granular user performance on a per-word basis.
- Monitors how many times a word was answered correctly vs incorrectly.
- Used to calculate the SRS (Spaced Repetition System) intervals.
- Data is logged locally in `localStorage` but can be synchronized with Firebase RTDB for cross-device progression.

## 2. In-Game Rate Feature (`question_feedback`)
In activities like the Quiz mode, users are presented with a discreet "Thumbs Up / Thumbs Down" UI to rate the quality of the current question.

**Current Implementation:**
- When a user clicks Like/Dislike, the `_sendFeedback(type)` method fires.
- It pushes a payload to the Firebase Realtime Database under the `question_feedback` node.
- The payload includes: `question text`, `rating type` (like/dislike), `language key`, `wordId`, and a `timestamp`.

**Purpose & Future Scope:**
Currently, this acts as a **raw telemetry log**. It does not instantly or automatically adjust the local `learningLoop` prompts on the device in real-time. Instead, it aggregates data so that developers (or future Cloud Functions) can analyze which specific AI-generated questions or vocabulary words are consistently rated poorly. This data is intended to be used to manually (or eventually, algorithmically) tune the LLM Prompt schemas to stop generating confusing or inaccurate questions.

## 3. AI Learning Loop (`learning_loop.js`)
Distinct from the manual Rate feature, the app has an AI Learning Loop that *does* attempt to self-correct based on session performance:
- It records session stats (accuracy, time).
- After sufficient sessions, users can click "Analyze Now" in Settings.
- The app sends the recent session logs to the LLM, asking it to suggest prompt adjustments.
- If the LLM suggests adjustments (e.g., "Make quiz questions simpler"), the user is prompted to approve or dismiss them. If approved, the local prompt templates are permanently updated.
