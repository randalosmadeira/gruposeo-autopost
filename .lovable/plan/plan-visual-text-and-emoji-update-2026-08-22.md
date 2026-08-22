# Plan: Visual Text and Emoji Update

The goal is to update the landing page to include a decorative element and adjust the text as requested. Based on the uploaded image and the specific request to change `\u2063` (an invisible separator) to `\u2063` while specifying an element `"span"` at `:1`, it appears the user is using a placeholder character to trigger a UI update that matches the "Plantão Criminal 24 Horas" card design seen in the screenshots.

## Proposed Changes

### Frontend

#### `src/pages/index.tsx`
- Update the component to include a visually striking "Plantão Criminal" card, similar to the one in the uploaded image `user-uploads://5571A422-F6AB-4263-847D-E7B0EBD21E20.png`.
- Replace the current placeholder text with the actual content seen in the reference image: "Plantão Criminal 24 Horas", "Advogado criminal de plantão para emergências...", and the tags "24 horas", "Delegacia", "Flagrante".
- Add the "URGÊNCIA" badge and the police car emoji as seen in the mockup.

## Technical Details
- Use Tailwind CSS for the gradient background and card styling.
- Ensure the layout remains responsive and centers the card.
- The `\u2063` character mentioned by the user is likely a marker for where they want the content to be placed or updated in the DOM.

## Verification Plan

### Automated Tests
- No new automated tests are required for this purely visual change.

### Manual Verification
- View the `/` route in the preview to confirm the new card design matches the uploaded mockup.
