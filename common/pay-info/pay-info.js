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
                const dayData = data[curEarn.date] || {};
                const earnType = curEarn.type;
                if (earnType === earningsTypes.BREATH1) {
                    dayData['session1Earned']= curEarn.amount;
                } else if (earnType === earningsTypes.BREATH2) {
                    dayData['session2Earned']= curEarn.amount;
                } else if (earnType === earningsTypes.STREAK_BONUS1 || earnType === earningsTypes.STREAK_BONUS2) {
                    dayData['streakBonus']= curEarn.amount;
                }
                const total = Object.keys(dayData).filter(k => k !== 'total').reduce((sum, key) => sum + dayData[key], 0);
                dayData['total'] = total;
                data[curEarn.date] = dayData;
            }
            const templateData = Object.entries(data).map(([k, v]) => {
                const dateParts = k.split('-');
                v['day'] = `${dateParts[1]}/${dateParts[2]}/${dateParts[0]}`; // conver YYYY-MM-DD to MM/DD/YYYY
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
