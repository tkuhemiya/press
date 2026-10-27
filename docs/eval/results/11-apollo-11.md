# Apollo 11, launch to splashdown

Apollo 11 took eight days, three men and two spacecraft that spent most of the trip docked
together. The flight is easiest to follow on two axes at once: *when* things happened, and
*what shape the spacecraft was in* when they did. Most of the mission's risk lived in the
moments where the shape changed.

## Eight days in July

```timeline id=mission title="Apollo 11, 16–24 July 1969 (UTC)"
1969-07-16T13:32 launch: "Saturn V launch"
1969-07-16T16:22 tli: "Translunar injection"
1969-07-19T17:21 loi: "Lunar orbit insertion"
group "Eagle on the Moon" {
  1969-07-20T20:17 landing: "Eagle lands" {role=focus}
  1969-07-21T02:56 eva: "Moonwalk" {until=1969-07-21T05:11}
  1969-07-21T17:54 ascent: "Lunar liftoff"
}
1969-07-21T21:35 dock: "Docks with Columbia"
1969-07-22T04:55 tei: "Trans-Earth injection"
1969-07-24T16:50 splash: "Splashdown" {role=happy}
steps:
  launch "The Saturn V's three stages put the stack into a parking orbit 12 minutes after launch."
  tli "One more burn of the third stage, about two and a half hours in, aims the stack at the Moon."
  loi "Three days later the service engine fires behind the Moon, out of contact, to drop into orbit."
  landing "Eagle lands with well under a minute of descent fuel to spare."
  splash "After a two-and-a-half-day coast home, the command module splashes down in the Pacific."
```

The [launch](#mission.launch) from Kennedy Space Center used all three stages of the Saturn V.
The first two were spent within ten minutes; the third, the S-IVB, put the stack into Earth
orbit and then, after one and a half orbits of checkout, relit for
[translunar injection](#mission.tli). That burn is the one that commits a crew to the Moon:
the trajectory was a *free return*, so if the main engine had failed, lunar gravity alone
would have swung them back towards Earth.

The coast took three days. [Lunar orbit insertion](#mission.loi) happened on the far side of
the Moon, so Mission Control only learned it had worked when Columbia reappeared on schedule.

The [landing](#mission.landing) is the part everyone remembers. During powered descent the
guidance computer threw repeated 1202 and 1201 alarms: it was overloaded by radar data it did
not need and was shedding low-priority work. Controllers in Houston judged that safe and
called "go". Then Armstrong saw that the automatic targeting was taking Eagle into a boulder
field, took semi-manual control and flew long, landing in the Sea of Tranquility with roughly
25 seconds of fuel before a mandatory abort call.

The [moonwalk](#mission.eva) lasted about two and a quarter hours. Armstrong and Aldrin set
up a seismometer, a laser retroreflector (still used today) and a solar-wind sheet, and
collected 21.5 kg of rock. Michael Collins orbited alone in Columbia the whole time.

## The spacecraft kept changing shape

Apollo used *lunar orbit rendezvous*: rather than land the whole vehicle, it carried a small,
disposable lander and left the return ship in orbit. That saved enormous mass, at the cost of
a sequence of separations and dockings that each had to work first time.

```state-machine id=config title="What was flying, stage by stage"
start -> stack
stack: "CSM + LM + S-IVB"
csm_lm: "CSM docked to LM"
apart: "CSM and LM apart"
csm: "CSM alone"
cm: "Command module alone"
stack -> csm_lm : transposition and docking
csm_lm -> apart : undock in lunar orbit {role=focus}
apart -> csm_lm : rendezvous and redock {role=happy}
csm_lm -> csm : jettison LM ascent stage
csm -> cm : jettison service module
cm -> end : splashdown
apart -> end : no redock {role=error}
steps:
  stack -> csm_lm "Collins turns Columbia around and pulls Eagle out of the third stage, which is then discarded."
  csm_lm -> apart "Eagle undocks: from here, two crews depend on finding each other again."
  apart -> csm_lm "The ascent stage, launched from the surface, catches Columbia in orbit about four hours later."
  csm -> cm "Just before re-entry, the service module is dropped and only the capsule with its heat shield comes home."
```

Three hours after launch, Collins performed
[transposition and docking](#config.csm_lm): Columbia separated from the third stage, turned
around and docked nose-to-nose with Eagle, pulling it free. The pair flew together to the
Moon. In lunar orbit, Armstrong and Aldrin crawled through the tunnel into Eagle and
[undocked](#config.apart).

After the surface stay, only Eagle's upper half left the Moon; the descent stage stayed
behind as a launch pad. The [rendezvous](#config.csm_lm) with Columbia was the step with no
fallback: Columbia could not land, and the ascent stage carried no heat shield. Once the crew
was back aboard, Eagle was cast off, and on 22 July the service engine fired for
[trans-earth injection](#mission.tei).

The last change of shape came minutes before re-entry. The service module, with the engine
and most of the consumables, was jettisoned, leaving the [command module](#config.cm) to hit
the atmosphere at about 11 km/s behind its heat shield. Parachutes opened, and on 24 July it
[splashed down](#mission.splash) southwest of Hawaii, where USS Hornet recovered the crew
into 21 days of quarantine.
