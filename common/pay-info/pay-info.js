import payboardTempl from "./payboard.handlebars";
import { earningsTypes } from "../types/types.js";

export class Payboard {
    constructor(rootDiv, errorDiv, client, userId, admin = false) {
        this.rootDiv = rootDiv;
        this.errorDiv = errorDiv;
        this.client = client;
        this.userId = userId;
        this.admin = admin;
    }

    async init() {
        await this.refresh();
        // set class of root div
        this.rootDiv.classList.add("pay-info");
    }

    async refresh() {
        try {
            // get data
            let earnings;
            if (this.admin) {
                earnings = await this.client.getEarningsForUser(this.userId);
            } else {
                earnings = await this.client.getEarningsForSelf();
            }
            const data = {};
            let overallTotal = 0;

            for (let i=0; i<earnings.length; i++) {
                const curEarn = earnings[i];
                overallTotal += curEarn.amount;
                const ymdDate = curEarn.date.substring(0, 10);
                const dayData = data[ymdDate] || {};
                const earnType = curEarn.type;
                if (earnType === earningsTypes.VISIT_1 || earnType === earningsTypes.VISIT_2) {
                    dayData['visits'] = (dayData['visits'] || 0) + curEarn.amount;
                } else if (earnType === earningsTypes.BREATH1 || earnType === earningsTypes.PERFORMANCE_BREATH2) {
                    dayData['sessions'] = (dayData['sessions'] || 0) + curEarn.amount;
                } else if (earnType === earningsTypes.COMPLETION_BREATH2) {
                    // participants get $8 for COMPLETION_BREATH2, but $4 of 
                    // that is considered normal session pay and half is a bonus
                    // for doing two sessions in a day
                    dayData['sessions'] = (dayData['sessions'] || 0) + curEarn.amount / 2;
                    dayData['bonuses'] = (dayData['bonuses'] || 0) + curEarn.amount / 2;
                } else if (earnType === earningsTypes.TOP_25 ||
                    earnType === earningsTypes.TOP_66 ||
                    earnType === earningsTypes.STREAK_BONUS
                ) {
                    dayData['bonuses'] = (dayData['bonuses'] || 0) + curEarn.amount;
                }
                const total = Object.keys(dayData).filter(k => k !== 'total').reduce((sum, key) => sum + dayData[key], 0);
                dayData['total'] = total;
                data[ymdDate] = dayData;
            }
            const templateData = Object.entries(data).map(([k, v]) => {
                const dateParts = k.split('-');
                v['day'] = `${dateParts[1]}/${dateParts[2]}/${dateParts[0]}`; // convert YYYY-MM-DD to MM/DD/YYYY
                return v
            });

            this.rootDiv.innerHTML = payboardTempl({'earnings': templateData, 'overallTotal': overallTotal});
        } catch (err) {
            this.handleError(err);
        }
    }

    handleError(err) {
        console.error(`error: ${err}`);
        this.errorDiv.textContent = `error: ${err.message ?? err}`;
    }
}
