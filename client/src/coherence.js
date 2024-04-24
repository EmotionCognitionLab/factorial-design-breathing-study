export function epToCoherence(ep) {
    return Math.log((ep / 10) + 1); // converts EP value from emWave to coherence value
}