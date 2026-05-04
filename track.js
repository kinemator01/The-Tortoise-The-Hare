/**
 * TRACK — the authoritative source of truth for the race layout.
 *
 * tileDepth : world units each row spans along -Z (forward direction).
 * tileWidth : world units each lane spans along X.
 * laneCount : must equal the width of every row in `layout`.
 *
 * layout row[r][l]
 *   r = row index, increases in the -Z direction (row 0 is the start line).
 *   l = lane index: 0 = left, 1 = centre, 2 = right.
 *
 * Tile codes
 *   0 = plain road
 *   1 = carrot  (floating boost pickup)
 *   2 = obstacle (spawns a 3-D object the rabbit must dodge or jump)
 *
 * Design rule: at least one lane per row must be passable (never [2,2,2]).
 * 160 rows × 4 units = 640 world units — one straight run, no looping.
 * Finish line sits at totalZ 618 (~row 154).  Last 6 rows are clear runway.
 */
const TRACK = {
  tileDepth: 4,
  tileWidth: 2,
  laneCount: 3,

  layout: [
    // ── Opening: gentle introduction ──────────────────────────────────────
    [0, 0, 0],   // row   0  — clear start
    [0, 0, 0],   // row   1  — clear
    [0, 1, 0],   // row   2  — carrot centre
    [2, 0, 0],   // row   3  — obstacle left
    [0, 2, 0],   // row   4  — obstacle centre
    [0, 0, 2],   // row   5  — obstacle right   (three consecutive switches)
    [0, 1, 0],   // row   6  — carrot (recovery)
    [2, 0, 2],   // row   7  — double obstacle
    [0, 0, 0],   // row   8  — breather
    [2, 0, 2],   // row   9  — double obstacle
    [0, 2, 0],   // row  10  — obstacle centre
    [1, 0, 0],   // row  11  — carrot left
    [2, 0, 2],   // row  12  — double obstacle
    [0, 0, 0],   // row  13  — breather
    [0, 2, 2],   // row  14  — double obstacle (left clear)
    [0, 1, 0],   // row  15  — carrot centre
    [2, 2, 0],   // row  16  — double obstacle (right clear)
    [2, 0, 2],   // row  17  — double obstacle
    [0, 2, 0],   // row  18  — obstacle centre
    [1, 0, 1],   // row  19  — double carrot

    // ── Section 2: reverse-direction run ─────────────────────────────────
    [0, 0, 0],   // row  20  — clear bridge
    [0, 0, 1],   // row  21  — carrot right
    [0, 0, 2],   // row  22  — obstacle right
    [0, 2, 0],   // row  23  — obstacle centre
    [2, 0, 0],   // row  24  — obstacle left    (mirror of rows 3–5)
    [0, 1, 0],   // row  25  — carrot centre
    [2, 0, 2],   // row  26  — double obstacle
    [0, 2, 0],   // row  27  — obstacle centre
    [2, 0, 2],   // row  28  — double obstacle
    [0, 0, 0],   // row  29  — breather
    [0, 2, 2],   // row  30  — double obstacle (left clear)
    [2, 0, 0],   // row  31  — obstacle left
    [2, 0, 2],   // row  32  — double obstacle
    [1, 0, 0],   // row  33  — carrot left
    [2, 2, 0],   // row  34  — double obstacle (right clear)
    [0, 2, 2],   // row  35  — double obstacle (left clear)
    [0, 0, 0],   // row  36  — breather
    [2, 0, 2],   // row  37  — double obstacle
    [0, 2, 0],   // row  38  — obstacle centre
    [0, 0, 1],   // row  39  — carrot right

    // ── Section 3: zigzag gauntlets ───────────────────────────────────────
    [2, 0, 2],   // row  40  — double obstacle
    [2, 2, 0],   // row  41  — double obstacle (right clear)  zig
    [0, 2, 2],   // row  42  — double obstacle (left clear)   zag
    [0, 0, 0],   // row  43  — breather
    [0, 1, 0],   // row  44  — carrot centre
    [2, 0, 0],   // row  45  — obstacle left
    [0, 0, 2],   // row  46  — obstacle right
    [2, 0, 2],   // row  47  — double obstacle
    [0, 2, 0],   // row  48  — obstacle centre
    [2, 0, 2],   // row  49  — double obstacle
    [0, 0, 0],   // row  50  — breather
    [2, 2, 0],   // row  51  — double obstacle (right clear)
    [2, 0, 2],   // row  52  — double obstacle
    [0, 2, 2],   // row  53  — double obstacle (left clear)
    [1, 0, 0],   // row  54  — carrot left
    [2, 0, 2],   // row  55  — double obstacle
    [0, 2, 0],   // row  56  — obstacle centre
    [2, 0, 2],   // row  57  — double obstacle
    [0, 0, 0],   // row  58  — breather
    [0, 0, 1],   // row  59  — carrot right

    // ── Section 4: sustained pressure ────────────────────────────────────
    [2, 0, 2],   // row  60  — double obstacle
    [2, 2, 0],   // row  61  — double obstacle
    [0, 2, 2],   // row  62  — double obstacle
    [2, 0, 2],   // row  63  — double obstacle  (4-row gauntlet)
    [0, 0, 0],   // row  64  — breather
    [0, 1, 0],   // row  65  — carrot centre
    [2, 0, 0],   // row  66  — obstacle left
    [0, 0, 2],   // row  67  — obstacle right
    [2, 0, 2],   // row  68  — double obstacle
    [0, 2, 0],   // row  69  — obstacle centre
    [2, 0, 2],   // row  70  — double obstacle
    [0, 0, 0],   // row  71  — breather
    [0, 2, 2],   // row  72  — double obstacle (left clear)
    [2, 0, 2],   // row  73  — double obstacle
    [2, 2, 0],   // row  74  — double obstacle (right clear)
    [0, 1, 0],   // row  75  — carrot centre
    [2, 0, 2],   // row  76  — double obstacle
    [0, 2, 0],   // row  77  — obstacle centre
    [2, 0, 2],   // row  78  — double obstacle
    [1, 0, 0],   // row  79  — carrot left

    // ── Section 5: first major gauntlet ──────────────────────────────────
    [2, 0, 2],   // row  80  — double obstacle
    [2, 2, 0],   // row  81  — double obstacle
    [0, 2, 2],   // row  82  — double obstacle
    [2, 0, 2],   // row  83  — double obstacle  (4-row opening)
    [0, 0, 0],   // row  84  — breather
    [0, 1, 0],   // row  85  — carrot centre
    [2, 0, 2],   // row  86  — double obstacle
    [0, 2, 0],   // row  87  — obstacle centre
    [2, 0, 2],   // row  88  — double obstacle
    [2, 2, 0],   // row  89  — double obstacle (right clear)
    [0, 0, 0],   // row  90  — breather
    [0, 2, 2],   // row  91  — double obstacle (left clear)
    [2, 0, 2],   // row  92  — double obstacle
    [0, 2, 0],   // row  93  — obstacle centre
    [1, 0, 1],   // row  94  — double carrot
    [2, 0, 2],   // row  95  — double obstacle
    [2, 2, 0],   // row  96  — double obstacle
    [0, 2, 2],   // row  97  — double obstacle
    [2, 0, 2],   // row  98  — double obstacle  (4-row closing)
    [0, 0, 0],   // row  99  — breather

    // ── Section 6: mid-race pressure ─────────────────────────────────────
    [2, 0, 2],   // row 100  — double obstacle
    [0, 2, 0],   // row 101  — obstacle centre
    [2, 0, 0],   // row 102  — obstacle left
    [0, 0, 2],   // row 103  — obstacle right
    [0, 0, 0],   // row 104  — breather
    [0, 1, 0],   // row 105  — carrot centre
    [2, 0, 2],   // row 106  — double obstacle
    [2, 2, 0],   // row 107  — double obstacle (right clear)
    [0, 2, 2],   // row 108  — double obstacle (left clear)
    [0, 0, 0],   // row 109  — breather
    [2, 0, 2],   // row 110  — double obstacle
    [0, 2, 0],   // row 111  — obstacle centre
    [2, 0, 2],   // row 112  — double obstacle
    [1, 0, 0],   // row 113  — carrot left
    [0, 2, 2],   // row 114  — double obstacle (left clear)
    [2, 0, 2],   // row 115  — double obstacle
    [0, 0, 0],   // row 116  — breather
    [2, 2, 0],   // row 117  — double obstacle (right clear)
    [0, 2, 0],   // row 118  — obstacle centre
    [0, 0, 1],   // row 119  — carrot right

    // ── Section 7: near-final push ────────────────────────────────────────
    [2, 0, 2],   // row 120  — double obstacle
    [2, 2, 0],   // row 121  — double obstacle
    [0, 2, 2],   // row 122  — double obstacle
    [2, 0, 2],   // row 123  — double obstacle  (4-row gauntlet)
    [0, 0, 0],   // row 124  — breather
    [0, 1, 0],   // row 125  — carrot centre
    [2, 0, 0],   // row 126  — obstacle left
    [0, 2, 0],   // row 127  — obstacle centre
    [0, 0, 2],   // row 128  — obstacle right
    [2, 0, 2],   // row 129  — double obstacle
    [0, 0, 0],   // row 130  — breather
    [0, 2, 2],   // row 131  — double obstacle (left clear)
    [2, 0, 2],   // row 132  — double obstacle
    [2, 2, 0],   // row 133  — double obstacle (right clear)
    [1, 0, 1],   // row 134  — double carrot
    [2, 0, 2],   // row 135  — double obstacle
    [0, 2, 0],   // row 136  — obstacle centre
    [2, 0, 2],   // row 137  — double obstacle
    [0, 0, 0],   // row 138  — breather
    [2, 0, 2],   // row 139  — double obstacle

    // ── Section 8: final gauntlet then clear runway ───────────────────────
    [2, 2, 0],   // row 140  — double obstacle (right clear)
    [0, 2, 2],   // row 141  — double obstacle (left clear)
    [2, 0, 2],   // row 142  — double obstacle
    [0, 0, 0],   // row 143  — breather
    [0, 1, 0],   // row 144  — carrot centre
    [2, 0, 2],   // row 145  — double obstacle
    [0, 2, 0],   // row 146  — obstacle centre
    [2, 0, 2],   // row 147  — double obstacle
    [2, 2, 0],   // row 148  — double obstacle (right clear)
    [0, 0, 0],   // row 149  — breather
    [0, 2, 2],   // row 150  — double obstacle (left clear)
    [2, 0, 2],   // row 151  — double obstacle
    [0, 0, 0],   // row 152  — breather (approaching finish)
    [0, 1, 0],   // row 153  — last carrot — final stretch reward
    [0, 0, 0],   // row 154  — clear  ← finish gate appears ~here (totalZ 618)
    [0, 0, 0],   // row 155  — clear runway
    [0, 0, 0],   // row 156  — clear runway
    [0, 0, 0],   // row 157  — clear runway
    [0, 0, 0],   // row 158  — clear runway
    [0, 0, 0],   // row 159  — clear runway
  ],
};
