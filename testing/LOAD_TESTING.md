# Load Testing

**Status:** Decided (V4.1) · Part of the Wingman product & engineering spec.

Model presence heartbeats, Radar candidate queries, signal bursts, and Mission Meet concurrency at target city
scale. Validate Redis reaper throughput, DB transaction contention on ActiveUserLock, and worker purge lag under
load. Establish the metric that would justify cell-partitioning or a specialized geo service (never pre-emptively).
