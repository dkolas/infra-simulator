# Design Rationale - Agent Harness Infra Simulator

## Why I chose this theme and approach

I chose this project concept to touch on two themes at once: understanding of technical concepts and systems and reliability. Building and understanding applied AI systems has been the focus of my work for several years, and I wanted to choose a project that reflected that.

As an alternative project, I considered building a headless observability sink designed to be consumed by agents via CLI or API. I rejected this idea because it would be harder to demonstrate in a self-contained way.


## What makes my idea interesting or non-obvious

The harness infrastructure simulator is a start towards solving a real pain point I have experienced as a backend engineer: being able to tune infrastructure proactively rather than reactively. Too often I have adjusted scaling parameters under some duress when systems are hitting their limits. I wanted this tool to help tune infrastructure proactively instead by simulating how it might fail under different conditions.

Building a very specific simulator like this might have taken too long to seem worthwhile in the time before AI assisted coding, but it is now most definitely viable.

## Key design decisions and tradeoffs

Several elements of the design were chosen specifically to fit into a quick two-hour prototype:
* It is a single page static application with no connections to live configuration or sources. I think this tool would be more useful if it could derive its current parameters from real infrastructure, either by direct read or processing infrastructure-as-code. Either of these would have added significant complexity however without changing the core demonstration. These are noted as possible extensions.
* Dynamic infrastructure configuration would also expand utility, but it would have taken much longer to build out just the configuration portions and I would not have been able to focus on the simulation.
* I did not iterate much at all on overall design, instead relying on some high-level guidance and short-hand to suggest theming and layout. I tried to spend more time up-front specifying the key parts of the interface so that I would not need as many rounds to get something workable. With more time, I might have allowed Claude to work up several concepts and then picked the best.

## How I'd extend this with more time

The main thing I'd love to do if I were going to spend more time with this project is connect it to real data. Specifically, using distributions derived from a production system (input rates, total processing times, size and frequency of bursts) and current values of system scaling parameters (container scaling rules, queue visibility timeouts, grace periods). By attaching this to real data, either through a direct connection or the ability to import parameters, this tool could be actually useful in tuning infrastructure for difficult scenarios.

Other possibilities for feature extension include making the overall architecture to test more configurable, the ability to play through pre-configured scenarios, and visibility into per-client waits to test the effects of different rate-limiting schemes.

It's also worth noting that I have not yet spent time validating the simulation code written by the LLM; additional rounds of review and comparision to real-world scenarios would both be useful.

## How long did I spend

The proof of concept was completed right around the two-hour mark. Of this time, around half was spent up-front on bootstrapping the respository and developing the concept, and the second hour was spent on implementation, minor improvements, and bug fixes. I spent an additional 30 minutes writing the required documentation and recording video.

