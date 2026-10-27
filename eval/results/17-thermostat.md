# How a thermostat holds a temperature, and why it overshoots

A thermostat is the textbook example of a feedback controller. It measures the room,
compares that with the temperature you asked for, and switches the heater to close the gap.
That is all it does, and it is enough to hold a room within a degree or so. It is also why
the room never sits *exactly* at the set point: it drifts above and below it in a slow,
steady wave.

## A balancing loop

The heart of it is one loop. The further the room is below the set point, the bigger the
**gap**; the bigger the gap, the more the heater runs; the more it runs, the warmer the room;
the warmer the room, the smaller the gap. One negative link in the loop makes it balancing:
whatever pushes the temperature away, the loop pushes back.

```causal-loop id=loop title="Thermostat feedback"
setpoint: "Set point"
gap: "Temperature gap"
heater: "Heater output"
heat: "Heat in the radiator"
temp: "Room temperature"
loss: "Heat lost outside"
setpoint -> gap : +
gap -> heater : +
heater -> heat : +
heat -> temp : +
temp -> gap : -
temp -> loss : +
loss -> temp : -
loop "Correction": gap -> heater -> heat -> temp -> gap
loop "Leakage": temp -> loss -> temp
steps:
  gap -> heater "When the room is colder than the set point, the gap is positive and the thermostat calls for heat."
  heater -> heat "The heater does not warm the room directly; it first warms the radiator, the water or the air in the ducts."
  heat -> temp "That stored heat flows into the room over minutes, not seconds."
  temp -> gap "As the room warms, the gap shrinks, and eventually the thermostat switches the heater off."
  loss -> temp "All the while the room leaks heat outdoors, which is what makes the cycle start again."
```

Notice the [radiator](#loop.heat) sitting between the [heater](#loop.heater) and the
[room](#loop.temp). That stage is the reason for the overshoot.

## On and off, with a dead band

Most household thermostats cannot ask for "a little heat". The heater is either on or off.
If the thermostat switched at exactly the set point it would chatter, flicking on and off
every few seconds as the reading wobbles across the line. So it uses **hysteresis**: it
turns the heat on a little below the set point and off a little above it. The gap between
those two thresholds is the dead band, often about half a degree each side.

```state-machine id=modes title="Heating with a dead band (set point 20°C)"
start -> idle
idle -> heating : below 19.5°C
heating -> coasting : above 20.5°C {role=focus}
coasting -> idle : heat used up
idle -> idle : 19.5–20.5°C
steps:
  idle -> heating "The room has drifted below the lower threshold, so the thermostat closes the relay and the boiler fires."
  heating -> coasting "The room reaches the upper threshold and the thermostat cuts the heat, but the radiators are still hot."
  coasting -> idle "The stored heat keeps flowing in until the radiators cool, carrying the room past the threshold."
```

The dead band alone guarantees the room swings by about a degree. Overshoot is the part
*beyond* that swing.

## Why it overshoots

Overshoot comes from **delay**. When the thermostat turns the heater off at 20.5°C, the
radiators, the boiler water and the air in the ducts are still full of heat. That heat keeps
flowing into the room for several minutes, so the temperature carries on rising to perhaps
21.5°C before it peaks. In the [coasting state](#modes.coasting) the thermostat has already
made its decision, but the room has not yet felt it.

The same happens in reverse. When the room cools to 19.5°C and the heater fires, it takes
time for the radiators to warm up, and the room keeps cooling meanwhile. It undershoots
before the heat arrives.

Two more delays add to this:

- **The sensor lags.** A thermostat on a wall measures its own plastic case, which warms
  more slowly than the air. It reports the past.
- **The thermostat is in one spot.** Warm air rises and pools; the reading near the door is
  not the reading near the radiator.

Any balancing loop with a delay in it oscillates. The longer the delay relative to how fast
the controller reacts, the bigger the swings. A heavy cast-iron radiator or an underfloor
system with a lot of thermal mass overshoots more than a fan heater.

## How better thermostats reduce it

- **Anticipators.** Old mechanical thermostats had a tiny heater inside that warmed the
  sensor while the heat was on, tricking it into switching off early, just before the
  stored heat arrives.
- **PID and modulating control.** Smart thermostats learn how the room responds and cut the
  heat before the set point, or turn a modulating boiler down gradually instead of
  switching it off. The derivative term watches *how fast* the temperature is rising,
  which is exactly the warning sign of overshoot.
- **Cycle-rate limits.** Running the boiler in fixed-length bursts gives smoother results
  than waiting for thresholds.

None of these remove the loop's delay. They just stop treating the heater as if it acted
instantly.
