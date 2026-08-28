const { validateAvailabilityInput } = require('./validation');

const MINUTE_MS = 60_000;

function overlaps(aStartMs, aEndMs, bStartMs, bEndMs) {
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

function alignToInterval(timestampMs, dayStartMs, intervalMs) {
  const elapsedMs = Math.max(0, timestampMs - dayStartMs);
  return dayStartMs + Math.ceil(elapsedMs / intervalMs) * intervalMs;
}

function calculateAvailableSlots(input) {
  validateAvailabilityInput(input);

  const intervalMs = input.intervalMinutes * MINUTE_MS;
  const serviceMs = input.serviceMinutes * MINUTE_MS;
  const beforeMs = input.bufferBeforeMinutes * MINUTE_MS;
  const afterMs = input.bufferAfterMinutes * MINUTE_MS;
  const earliestMs = Math.max(input.dayStartMs, input.minimumStartMs);
  const firstStartMs = alignToInterval(earliestMs, input.dayStartMs, intervalMs);
  const slots = [];

  for (
    let startMs = firstStartMs;
    startMs < input.dayEndMs;
    startMs += intervalMs
  ) {
    const occupiedStartMs = startMs - beforeMs;
    const endMs = startMs + serviceMs;
    const occupiedEndMs = endMs + afterMs;

    if (occupiedStartMs < input.dayStartMs || occupiedEndMs > input.dayEndMs) {
      continue;
    }
    if (input.busy.some((period) => overlaps(
      occupiedStartMs,
      occupiedEndMs,
      period.startMs,
      period.endMs,
    ))) {
      continue;
    }

    slots.push({ startMs, endMs });
  }

  return slots;
}

module.exports = {
  alignToInterval,
  calculateAvailableSlots,
  overlaps,
};
