# Physical Layout

Confirmed from the product photo/user screenshot:

```text
Viewed from above, logo at bottom

4x4 key grid                    knob area

┌─────┬─────┬─────┬─────┐     ┌────────┐ ┌────────┐
│ k1  │ k2  │ k3  │ k4  │     │   w1   │ │   w2   │
├─────┼─────┼─────┼─────┤     └────────┘ └────────┘
│ k5  │ k6  │ k7  │ k8  │       OLED / status slot
├─────┼─────┼─────┼─────┤
│ k9  │ k10 │ k11 │ k12 │              ┌──────────┐
├─────┼─────┼─────┼─────┤              │    w3    │
│ k13 │ k14 │ k15 │ k16 │              └──────────┘
└─────┴─────┴─────┴─────┘
```

Each knob exposes three logical controls:

- `w1_ccw`, `w1_cw`, `w1_press`
- `w2_ccw`, `w2_cw`, `w2_press`
- `w3_ccw`, `w3_cw`, `w3_press`

The current coordinate map lives in
`definitions/physical-controls.json`.

Each control can have two coordinates:

- `matrix`: the dynamic-keymap storage coordinate used for reading/writing the
  binding that the board will emit.
- `liveMatrix`: the observed switch-matrix coordinate used only for live UI
  highlighting.

The split is intentional. On this wireless board, live switch-state rows do not
line up with the dynamic-keymap rows. For example, pressing physical `k5`
reports the raw live bit that the previous app treated as `k1`.

The clockwise/counter-clockwise labels are provisional until we rotate each knob
and verify which matrix position fires for each direction. If they are reversed,
we will update only `definitions/physical-controls.json`; all higher-level
layouts can stay named by physical intent.
