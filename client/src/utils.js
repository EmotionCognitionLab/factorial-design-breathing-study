export function yyyymmddNumber(date) {
    return Number.parseInt(yyyymmddString(date));
}

export function yyyymmddString(date) {
    return `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2,0)}${date.getDate().toString().padStart(2, 0)}`;
}

import { SessionStore } from './session-store'
import ApiClient from '../../common/api/client';
export async function getCondition() {
    const session = await SessionStore.getRendererSession()
    const apiClient = new ApiClient(session)
    const data = await apiClient.getSelf()
    return data.condition
}

export async function getConditionFactors() {
    const condition = await getCondition()
    return conditionToFactors(condition)
}

/**
Conditions are numbers from 0 to 63. Factors are things like
do we show the heart rate chart, is their pace selection personalized
or standardized, etc.
We convert a condition to a set of factors as follows:
1. Convert the condition to binary (zero padding it if necessary so that it's six digits)
2. From left to right, convert each digit in the result to a factor as follows:

1st digit is breathing frequency range: 0 = slower, 1 = slow
2nd is pace selection: 0 = standard, 1 = personalized
3rd is display heart rate chart: 0 = no, 1 = yes
4th is display positive emotion instructions: 0 = no, 1 = yes
5th is audio pacing present: 0 = no, 1 = yes
6th is rewards: 0 = rewards for completion, 1 = rewards for performance
 */

export function conditionToFactors(condition) {
    if (condition < 0 || condition > 63) {
        throw new Error(`Expected condition to be between 0 and 63, but got ${condition}.`)
    }

    const factorValues = condition.toString(2).padStart(6, '0').split('').map(i => Number.parseInt(i))
    const breathingFrequency = factorValues[0] == 0 ? 'slower' : 'slow'
    const paceSelection = factorValues[1] == 0 ? 'standard' : 'personalized'
    const rewards = factorValues[5] == 0 ? 'completion' : 'performance'

    return {
        breathingFrequency: breathingFrequency,
        paceSelection: paceSelection,
        showHeartRate: Boolean(factorValues[2]),
        showPosEmoInstructions: Boolean(factorValues[3]),
        playAudioPacer: Boolean(factorValues[4]),
        rewards: rewards
    }
}

export const emoPics = ['1', '2', '3', '4', '5', '6', '7', '8']
export const emoPicExt = '.jpeg'