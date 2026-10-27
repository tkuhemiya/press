# How photosynthesis turns light into sugar

Photosynthesis looks like a single reaction on paper, 6 CO₂ + 6 H₂O + light → C₆H₁₂O₆ + 6 O₂,
but inside a chloroplast it is two separate machines joined by a pair of chemical
"batteries". The first machine turns light into chemical energy. The second spends that energy
to build sugar from carbon dioxide. Neither cares how the other works; they only trade
ATP and NADPH one way, and the spent ADP and NADP⁺ the other.

## Two machines in one chloroplast

```architecture id=chloro title="Inside the chloroplast" direction=right
sun: external "Sunlight"
water: external "Water"
air: external "CO₂ from air"
group "Thylakoid membrane" {
  ps2: service "Photosystem II"
  etc: service "Electron transport chain"
  ps1: service "Photosystem I"
  synthase: service "ATP synthase"
}
group "Stroma" {
  calvin: service "Calvin cycle" {role=focus}
}
oxygen: external "O₂ released"
sugar: storage "Sugar (G3P)"
sun -> ps2 : light
sun -> ps1 : light
water -> ps2 : electrons
ps2 -> oxygen : O₂
ps2 -> etc : electrons
etc -> ps1 : electrons
etc -> synthase : proton gradient
ps1 -> calvin : NADPH
synthase -> calvin : ATP
air -> calvin : CO₂
calvin -> sugar : G3P
calvin --> ps1 : NADP⁺
calvin --> synthase : ADP
steps:
  sun -> ps2 "Light excites chlorophyll in photosystem II, knocking an electron loose."
  water -> ps2 "The hole is filled by splitting water; the oxygen we breathe is the waste."
  etc -> synthase "As electrons move down the chain they pump protons, and the gradient spins ATP synthase."
  ps1 -> calvin "Photosystem I re-energises the electrons and loads them onto NADPH."
  calvin -> sugar "The Calvin cycle spends ATP and NADPH to turn CO₂ into a three-carbon sugar."
```

### The light reactions

Everything starts in the thylakoids, flattened membrane sacs stacked inside the chloroplast.
Their membranes hold chlorophyll arranged in two light-harvesting complexes. When a photon
reaches [photosystem II](#chloro.ps2), its energy lifts an electron in chlorophyll to a high
energy level, and that electron is handed off to a chain of carriers.

Chlorophyll must get an electron back, and it takes one from [water](#chloro.water). Splitting
two water molecules yields four electrons, four protons and one molecule of O₂. That is where
all the oxygen in the atmosphere came from: a by-product of plants scavenging electrons.

As the electrons pass along the [transport chain](#chloro.etc), they power a pump that moves
protons into the thylakoid interior. The membrane now holds a steep proton gradient, and the
only way back out is through [ATP synthase](#chloro.synthase), a rotary motor that makes ATP as
protons flow through it. Meanwhile the electrons arrive at [photosystem I](#chloro.ps1), absorb
a second photon, and are loaded onto NADP⁺ to make NADPH, a carrier of high-energy electrons.

### The Calvin cycle

In the surrounding fluid, the stroma, the [Calvin cycle](#chloro.calvin) does the actual
carbon work. It doesn't need light directly; it needs the ATP and NADPH the light reactions
produce, which is why it stops soon after dark.

```state-machine id=calvin title="The Calvin cycle, per three CO₂"
rubp: "RuBP ×3 (5 carbons each)"
pga: "3-PGA ×6"
g3p: "G3P ×6"
start -> rubp
rubp -> pga : fix 3 CO₂ {role=focus}
pga -> g3p : spend 6 ATP, 6 NADPH
g3p -> rubp : recycle 5 G3P, spend 3 ATP
g3p -> end : export 1 G3P {role=happy}
steps:
  rubp -> pga "RuBisCO bolts a CO₂ onto each five-carbon RuBP; the unstable result splits into two 3-PGA."
  pga -> g3p "ATP and NADPH from the light reactions reduce 3-PGA to G3P, an energy-rich sugar."
  g3p -> rubp "Five of every six G3P are rearranged back into RuBP so the cycle can keep turning."
  g3p -> end "The sixth G3P is the profit: the plant's building block for glucose, sucrose and starch."
```

The cycle's key step is [carbon fixation](#calvin.pga), done by the enzyme RuBisCO, which
attaches a CO₂ molecule to a five-carbon sugar called RuBP. RuBisCO is slow, a few reactions a
second, and sometimes grabs O₂ by mistake, so plants make enormous amounts of it; it may be
the most abundant protein on Earth.

The products are then reduced into [G3P](#calvin.g3p) using the ATP and NADPH. The accounting
is the crux: three turns fix three carbons and yield six G3P, but five of them must be
[recycled](#calvin.rubp) to regenerate RuBP. Only one G3P leaves as net gain. Two of those
make one glucose, so each glucose costs 18 ATP and 12 NADPH, and the light reactions must
keep up.

Put together, light drives electrons from water up to NADPH, and that stored energy is spent
fixing carbon from the air. The sugar a plant makes is, in a very literal sense, sunlight
locked into chemical bonds.
