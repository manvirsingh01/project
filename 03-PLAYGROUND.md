# PQC-on-IoT Simulator — Interactive Playground

Companion to `01-DESIGN.md` and `02-IMPLEMENTATION.md`. Those define the system and how to
build it; this file defines one specific screen: an animated, swappable "Playground" where a
user visually builds a small IoT network, picks which device sits where, and watches a PQC
handshake/signature flow move across the connection.

## 1. What this screen is

A canvas-style view (its own tab in the web app, alongside Devices / Simulator / Compare /
Network / Report) showing two or more **device nodes** connected by a **link line**. Each node
can be swapped to a different IoT device profile at any time via a dropdown on the node itself.
Triggering a run animates the chosen cryptographic exchange moving along the link, and the
node/link visuals react live to the result (fast+light vs. slow+heavy, reliable vs. marginal vs.
infeasible).

It is a visualization layer only — it calls the same `core` estimation functions from
`02-IMPLEMENTATION.md`, never its own math. Nothing here invents new numbers.

## 2. Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Playground                                                  │
│                                                                │
│   ┌───────────────┐                       ┌───────────────┐ │
│   │   Node A       │ ───── link ─────────▶ │   Node B       │ │
│   │ [device ▾]     │   (animated packet)    │ [device ▾]     │ │
│   │ RP2040         │                       │ NUCLEO-L476RG  │ │
│   │ ● Reliable     │                       │ ● Reliable     │ │
│   └───────────────┘                       └───────────────┘ │
│                                                                │
│   Algorithm: [ML-KEM-512 ▾]   Link: [802.15.4 ▾]   [▶ Run]  │
│                                                                │
│   Result strip: 35.7 ms · 9.4 KB stack · 2.83 mJ · 1 frame    │
└─────────────────────────────────────────────────────────────┘
```

- **Node A / Node B** — each a device card (same data as the Devices tab) with a dropdown to
  swap in any reference or custom device instantly.
- **Link** — the line between them; its style (thickness, dash pattern, color) reflects the
  chosen network link type and current MWC verdict.
- **Controls strip** — algorithm + security level, link type, hop count, loss rate, Run button.
- **Result strip** — live numeric readout, same fields as the Simulator tab's result card, so
  the Playground and Simulator never disagree.

## 3. Node states (visual + data-driven, not decorative)

| State | Trigger | Visual |
|---|---|---|
| Idle | before Run | neutral card, device name + spec summary |
| Running | during animation | pulsing border, small spinner matching estimated time scaled to an on-screen duration |
| Reliable | MWC verdict = reliable | green dot, solid link line |
| Marginal | MWC verdict = marginal | amber dot, dashed link line, tooltip explaining which resource is tight (RAM/flash) |
| Infeasible | MWC verdict = infeasible | red dot, broken/crossed link line, node shakes briefly, result strip shows why ("ML-DSA-87 needs 119.6 KB stack; CW308-STM32F3 has 40 KB total RAM") |

## 4. Animation design

Animation is a **proportional stand-in for the estimated time**, not a literal real-time replay
(35.7 ms would be invisible; 1,125 ms would be too long to sit through for every click).

- Map estimated time to an on-screen duration with a log-ish curve so fast and slow operations
  are both watchable: `displayMs = clamp(300, 2500, 200 * log10(estimatedTimeMs + 10))`.
- A small packet glyph travels from Node A to Node B along the link for KEM operations
  (key exchange is two-way conceptually, but shown as one clean pass for readability); for
  signature algorithms, the glyph pulses *at* Node A for the signing step (showing the
  rejection-sampling retries as several small pulses — number of pulses ≈ expected iteration
  count, 4.25 → rounds to 4, 5.1 → rounds to 5), then travels to Node B for verification.
- For network-fragmented payloads (ML-DSA signatures over 802.15.4), the glyph is shown as a
  short animated train of smaller fragments rather than one packet, with the count matching
  the computed `fragmentCount` — this is the one place the Playground visually teaches *why*
  PQC signatures strain a low-power link, instead of just stating a number.
- If `successProbability` (from the network model) is below a threshold, the animation shows a
  fragment dropping mid-link and a retry pass, reflecting the "one lost fragment drops the
  whole datagram" rule from the Network tab.
- Respect reduced-motion: if the browser signals `prefers-reduced-motion`, skip the travel
  animation and jump straight to the result state.

## 5. Swapping devices mid-session

- Changing either node's device dropdown immediately re-runs the MWC classification (cheap,
  synchronous) and updates the dot color/link style, without requiring a full "Run" — only the
  travel/pulse animation is gated behind the Run button.
- Swapping a node while an animation is in progress cancels the in-flight animation cleanly
  (no orphaned timers) and resets to Idle.
- A "+ Add custom device" option inside the node dropdown opens the same add-device form used
  on the Devices tab, so a new profile created here is immediately available everywhere else.

## 6. Multi-node mode (stretch, not required for v1)

Allow a third node acting as a relay (modeling a 6LoWPAN multi-hop scenario): Node A → Relay →
Node B. When present:
- `hops` passed to the network model switches from 1 to 2+, which drops effective payload per
  frame from 81 to 45 bytes (per `02-IMPLEMENTATION.md` §3.4) — the Playground should visibly
  show more/smaller fragments when a relay is added, making the hop-count cost tangible.
- The relay node shows a small "buffer" indicator representing the Virtual Reassembly Buffer
  (VRB) discussed in the report; if the relay device's RAM is very small, mark it as a VRB
  overflow risk (qualitative flag, not a new simulated metric).

## 7. Implementation notes

- Lives entirely in `web/index.html` alongside the other tabs; no new backend, no new core
  math — only a thin "animation controller" module that:
  1. reads a `SimulationResult`/`NetworkResult` from `core` (same calls as Simulator/Network
     tabs),
  2. maps it to timing/visual parameters per §4,
  3. drives inline SVG/CSS transitions.
- Suggested file split inside `web/`: `playground.css` (node/link/pulse styles),
  `playground.js` (state machine: Idle → Running → Result), `playground.html` fragment
  injected into the tab — but since the web app ships as one self-contained file, these are
  logical sections (clearly commented) rather than separate shipped files.
- No animation logic duplicates estimation logic — if a number changes in `core`, the
  Playground changes automatically because it reads the same functions as every other tab.

## 8. Out of scope for this screen

- No drag-and-drop freeform network builder in v1 — fixed two-node (optionally three-node)
  layout only.
- No physical radio simulation (no LoRaSim-style RF modeling) — the fragment/loss animation is
  illustrative of the analytic model in `02-IMPLEMENTATION.md`, not a new simulator.
- No side-channel/power-trace visualization — out of scope per `01-DESIGN.md` §3.
