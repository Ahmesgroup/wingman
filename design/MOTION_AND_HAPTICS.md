# Motion & Haptics

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Durations 120/180/280/500/900 ms; radar pulse 3000 ms; easings standard/enter/exit. Haptics: selection light,
signalSent soft, connectionConfirmed **doubleSoft (reserved signature)**, timeWarning warningShort, error rigid;
enabled by default. Rules: respect system + app preferences; never vibrate repeatedly during a countdown. Reduce-motion
turns pulses into fixed muted halos and collapses transitions to instant.
