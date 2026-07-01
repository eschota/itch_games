# Changelog

## v0.0.005

- Make the game-over overlay visual-only so iframe mouse/touch restart clicks
  route through the canvas instead of relying on HTML button pointer delivery.

## v0.0.004

- Add document-level iframe click fallback so any pointer, mouse, touch, or
  click event that reaches the game frame can restart from the game-over
  overlay.

## v0.0.003

- Harden restart on itch.io iframe builds with pointer, mouse, touch, and
  overlay-level fallback start handlers.

## v0.0.002

- Start the run automatically when the page opens.
- Harden pointer, click, touch, Enter, and Space handling for the restart button.
- Display the active version in the bottom-left corner.
- Document the game versioning, Git push, and autodeploy rule.

## v0.0.001

- First public Orbital Courier build.
