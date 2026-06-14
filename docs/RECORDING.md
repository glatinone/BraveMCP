# Recording the Demo GIF

The README ships with an SVG mockup ([`docs/assets/demo-conversation.svg`](assets/demo-conversation.svg))
so the project looks complete out of the box. To replace it with a real screen
recording, follow these steps and drop the result at `docs/assets/demo.gif`.

## What to record

Show the **before / after** value of BraveMCP in one short clip (15–25 seconds):

1. Open Claude Desktop with the `brave-memory` server connected.
2. Ask a vague, memory-style question, e.g.:
   > "Do you remember that article about MCP security I read last week?"
3. Let Claude call `find_forgotten_content` (or `search_memory`) and return the match.
4. Show Claude's final answer citing the page, visit count, and recency.

Keep it tight — trim dead air before/after the tool call.

## Tools

| OS | Tool | Notes |
|----|------|-------|
| Windows | [ScreenToGif](https://www.screentogif.com/) | Free, records a region directly to GIF |
| macOS | [Kap](https://getkap.co/) | Free, exports GIF |
| Any | [Peek](https://github.com/phw/peek) (Linux), OBS + gifski | For higher quality |

## Tips

- Record at the window size, not full screen — keep the file small (< 5 MB ideally).
- Target ~12–15 fps; GIF size grows fast with frame rate.
- Crop to just the Claude conversation panel.
- If the file is large, run it through [gifsicle](https://www.lcdf.org/gifsicle/)
  (`gifsicle -O3 --lossy=80 demo.gif -o demo.gif`) before committing.

## After recording

1. Save the file as `docs/assets/demo.gif`.
2. In `README.md`, the demo section already references it — uncomment the GIF
   line and the SVG becomes the fallback. No other change needed.
