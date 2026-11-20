// prefStepperFocus.ts - where the keyboard goes when a stepper's button reaches its end.
//
// A stepper's end button is disabled (PrefStepper.tsx says why). A disabled button cannot hold
// focus, so the press that reached the end dropped the keyboard to the page body: Enter did nothing
// more and Tab started again from the top of the window (screen pass, 2026-11-19). The press now
// hands focus to the stepper's OTHER button, which is the only way left to move the value.
//
// Pure, so the node suite can pin the rule; PrefStepper.tsx only applies the answer.

/** Which button a press was on: plus (1) or minus (-1). */
export type StepDir = 1 | -1

/**
 * The button to focus after a press with the keyboard on it, or null to leave focus alone.
 *
 * Only when the press reached ITS OWN end and the other end is still open: a press that left the
 * value mid-range keeps its focus, and a stepper with both ends shut (one stop) has nowhere to go.
 */
export function focusAfterStep(pressed: StepDir | null, atMin: boolean, atMax: boolean): 'minus' | 'plus' | null {
  if (pressed === 1 && atMax && !atMin) return 'minus'
  if (pressed === -1 && atMin && !atMax) return 'plus'
  return null
}
