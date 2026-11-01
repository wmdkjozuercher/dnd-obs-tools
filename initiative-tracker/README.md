# Initiative tracker for OBS

Runs locally with no server, packages, or internet connection. Keep index.html, tracker.css, tracker.js, and state.js together.

## OBS setup: three display panels

1. Add an OBS Browser source, enable Local file, and choose index.html.
2. Use a source size of **1920 × 1080** with the default vertical layout and 460 px card width. Increase height for a long full order.
3. The **Upcoming Turns** panel on the left shows the current turn followed by upcoming entries, limited to six by default. **Full Combat Order** on the right shows every combatant and legendary-action entry in initiative order, with the current turn highlighted. The third panel, **Current + Next**, is a small permanent overlay: current turn, intervening legendary actions, and the next actual combatant. Consecutive actions from the same enemy are grouped with a count to keep it compact.
4. Use OBS Interact to control the full page. Cropping does not remove its controls from the Interact window.
5. To show the panels independently, reuse the **same Browser source** as separate scene items (Add Existing or Paste Reference) and give each item its own crop. Keep one underlying source so all three views always share the encounter. Show/hide the full-order item when players need it.

At the default settings and 1920 px source width, these crops isolate the panels:

| Panel | Crop Left | Crop Right | Crop Top |
| --- | ---: | ---: | ---: |
| Upcoming Turns | 378 | 1082 | 0 |
| Full Combat Order | 876 | 584 | 0 |
| Current + Next | 1374 | 86 | 0 |

The panels include their own round chips. Current + Next also indicates when the next actual combatant belongs to the next round. It handles an active legendary action as the current turn and keeps the next regular combatant visible. Crop the bottom to the desired overlay height. Changing card width requires adjusting the crops. Each panel has its own vertical/horizontal selector. The three panels stay in their original positions for consistent OBS crops. Horizontal Upcoming and Full Order layouts show two smaller cards per row. Horizontal Current + Next is a single compact strip: a larger current-turn rectangle, small legendary-action cards in the middle, and the next actual combatant on the right.

The area around cards is transparent. Cards retain dark allegiance-tinted backgrounds; round chips retain dark backgrounds. Allegiance labels stay hidden. Enemy is coral, neutral amber, friendly green, and None gray.

## Combat controls

- **Add combatant:** enter name, initiative, allegiance, priority, and (for enemies) legendary-action count.
- **Next / Previous:** move through regular and legendary turns. Upcoming Turns keeps the selected turn first. A dashed End of Round / Start Round X separator marks a round boundary; entries beyond it use the actual next round's arrangement. This separator does not count toward the visible-turn limit. The full order keeps the round's initiative order.
- **Edit combatants:** change names, initiative, priority, and enemy legendary-action counts in the left roster. Press Enter or click away to save. Initiative edits update both orders while preserving the current turn.
- **Restart combat:** keep the roster, priorities, action counts, layout and display settings; return to round 1 and select the first combatant. The original round-1 legendary arrangement is restored.
- **Clear encounter:** remove all combatants and return to round 1, keeping layout/display settings.
- **Undo:** restore the previous encounter state, including removal, initiative edits, turn changes, skipping, restart, clear, loading JSON, and display changes. Up to 50 changes are available in the current page session. Undo history is not saved across reloads.
- **Skip Next Legendary Action / Skip Legendary Actions until next turn:** available in each enemy's edit block. Mark the next remaining action (including an active one) or every remaining action for that enemy until its next regular turn. This window crosses into the next round when necessary and stops at the enemy's next regular occurrence, not at round end. Cards remain visible with a Skipped label, and Next/Previous pass over them. An active action advances immediately when skipped. Other enemies and actions after the enemy's next regular turn are unaffected. Undo restores the previous skip state. Restart clears skip marks.

Combatants sort by initiative, highest first; ties use priority, lowest first. Defaults are enemy 100, neutral 50, friendly 10, and None 50. Equal initiative and priority keep their relative order. The first added combatant starts active; adding others preserves that turn. Click a name in either order to select a turn.

## Display settings

Open **OBS display settings** to adjust the number of visible compact turns (including the current turn), card width, text size, card spacing, and background opacity. All three panels share card appearance; their layout selectors are independent. Legendary-action cards in Current + Next inherit the owner's allegiance color, including enemy red. The full order is never limited. Upcoming Turns includes at most one round's worth of turn cards; when it crosses a boundary, the remaining slots preview the next round after the separator.

## Saving and loading

**Save JSON** downloads the complete encounter, including priorities, action counts, display settings, all three layouts, skipped actions by round, round, current turn, and the seed that restores the legendary-action arrangement. **Load JSON** replaces the encounter from a saved file. Invalid files leave the current encounter unchanged; a successful load can be undone. Older tracker saves receive default display settings automatically.

Changes also save automatically in OBS browser storage when available. Leave Shutdown source when not visible and Refresh browser when scene becomes active unchecked to avoid unnecessary reloads. A regular browser and OBS have separate storage; use Interact to control the OBS source.

## Legendary actions

Choose a count from 0 to 99 when adding an enemy or editing it in the left roster. Zero disables legendary actions. Each appears as a smaller card with the enemy name followed by Legendary Action, without an initiative counter.

Each batch starts after its monster's regular turn and ends before that monster's next regular turn, spanning a round boundary when needed. There are no legendary actions before the monster's first turn. Both adjacent gaps are excluded: no action can appear directly after or directly before its owner's regular turn, including across the end of a round. Actions spread across the remaining gaps before reusing them. If actions outnumber gaps, some gaps contain several actions. At least three combatants are needed for any legal gap; with fewer, the count stays saved but no action cards are inserted.

Each monster gets a newly randomized action batch for each interval between its own turns. Round end does not reset or replenish that batch; a calendar round can contain the end of one batch and the start of the next. Previous restores the earlier round's arrangement. Refreshing or loading JSON preserves it. Changing counts or the roster recomputes the current arrangement; removing an enemy removes all its legendary actions.

## Verification

Run from the repository root: node --test initiative-tracker/state.test.js
