# UnSoccer UI Network HUD Stability v0.0.010

Orchestrator note: UI Designer fixed the network HUD jitter reported from the
`websocket / ms / ms` widget. Push is intentionally left to Orchestrator.

Changed source:

- `unsoccer/client/index.html`

Generated after fix:

- `npm run build --workspace @itch-games/unsoccer-client`
- `unsoccer/client/dist/index.html`
- `unsoccer/client/dist/assets/index-h39ANQuG.js`

Dist staging caveat:

- `unsoccer/client/dist/` is ignored by `.gitignore`.
- If Orchestrator commits generated dist, include the new ignored asset
  intentionally, otherwise `dist/index.html` can point at a file absent from the
  commit.
- If Orchestrator prefers source-only, leave generated dist out and rebuild in
  the release flow.

Fix:

- The network HUD grid now uses stable desktop columns for transport, ping, and
  snapshot age.
- Numeric cells use tabular numerals and right alignment so changing values like
  `9 ms`, `41 ms`, `100 ms`, and `9999 ms` do not resize or move the widget.
- Mobile keeps equal responsive columns with the same numeric stability.

Before push:

- Orchestrator should decide whether to include the generated dist update in the
  release commit.
- Re-run the local UI browser gate on `http://127.0.0.1:5181/` if the release
  gate needs fresh screenshot evidence after this patch.
- Do not treat this note as a staged/committed artifact unless Orchestrator
  wants UI evidence included in the release commit.
