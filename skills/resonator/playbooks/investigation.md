# Investigation

**You own the answer. Plan, route, write.**

Investigation requests are read-only. They produce a cited explanation or a recommendation, not a code change.

1. Trace the code the question is about. Delegate broad sweeps to `Explore` with "do not edit files" in the brief. For motivation questions, also run the **why** skill. For "how does this work", the **how** skill.
2. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only investigation`.
3. Produce the output (Overview / Key Concepts / How It Works / Where Things Live / Gotchas), or a recommendation with a tradeoffs table if the request is a decision between alternatives.
4. Run the **unslop** skill on the reply.

No PR, no babysit, no **architect** unless the investigation precedes a code change. If it does, hand back to the user and re-route to **verina** or **feature**.

**Reply:** the investigation output. For "are we sure?" answers, include your real judgment with reasons. Push back if the premise is wrong (see Autonomy).
