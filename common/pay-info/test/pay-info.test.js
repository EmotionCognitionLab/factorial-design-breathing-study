import { earningsTypes } from "../../types/types.js";
import { Payboard } from "../pay-info.js";

const mockClient = (earnings) => ({
    getEarningsForUser: jest.fn(userId => earnings),
    getEarningsForSelf: jest.fn(() => earnings)
});

function earningsToRows(earnings) {
    const data = {};

    for (let i=0; i<earnings.length; i++) {
        const curEarn = earnings[i];
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

    return templateData;
}

function expectPayboardMatches(payboard, earnings) {

    const expectedRows = earningsToRows(earnings);

    const expectedDollars = (earningType, row) => {
        switch (earningType) {
            case earningsTypes.BREATH1: return row['session1Earned'] || 0;
            case earningsTypes.BREATH2: return row['session2Earned'] || 0;
            case earningsTypes.STREAK_BONUS1:
            case earningsTypes.STREAK_BONUS2: return row['streakBonus'] || 0;
            case 'total': return row['total'] || 0;
        }
    }

    const rows = payboard.rootDiv.querySelectorAll("tbody tr");
    expect(rows.length).toBe(expectedRows.length + 1);

    let overallTotal = 0;
    for (let i=0; i<rows.length - 1; i++) {
        const curRow = rows[i];
        const dayCell = curRow.children[0];
        const sess1Cell = curRow.children[1];
        const sess2Cell = curRow.children[2];
        const streakCell = curRow.children[3];
        const totalCell = curRow.children[4];
        
        const expRow = expectedRows[i];
        expect(dayCell.innerHTML).toBe(expRow['day']);
        expect(sess1Cell.innerHTML).toBe(`$${expectedDollars(earningsTypes.BREATH1, expRow)}`);
        expect(sess2Cell.innerHTML).toBe(`$${expectedDollars(earningsTypes.BREATH2, expRow)}`);
        const expStreakDollars = expectedDollars(earningsTypes.STREAK_BONUS1, expRow) || expectedDollars(earningsTypes.STREAK_BONUS2, expRow) || 0;
        expect(streakCell.innerHTML).toBe(`$${expStreakDollars}`);
        expect(totalCell.innerHTML).toBe(`$${expRow['total']}`);
        overallTotal += expectedDollars('total', expRow);
    }

    const totalRow = rows[rows.length - 1];
    const totalCell = totalRow.children[4];
    const nameCell = totalRow.children[0];
    expect(nameCell.innerHTML).toBe('Total');
    expect(totalCell.innerHTML).toBe(`$${overallTotal}`);

}

describe("Payboard", () => {
    beforeEach(() => {
        const root = document.createElement("div");
        root.id = "root";
        const error = document.createElement("div");
        error.id = "error";
        document.body.appendChild(root);
        document.body.appendChild(error);
    });
    
    afterEach(() => {
        document.querySelectorAll("body > div").forEach(e => {
            e.remove();
        });
    });

    it("should use getEarningsForUser when admin is true", async () => {
        const mc = mockClient([]);
        const {root, error} = getPayboardElements();
        const payboard = new Payboard(root, error, mc, {userId: '123abbc'}, true);
        await payboard.init();
        expect(mc.getEarningsForUser).toHaveBeenCalledTimes(1);
        expect(mc.getEarningsForSelf).not.toHaveBeenCalled();
    });

    it("should use getEarningsForSelf when admin is false", async () => {
        const mc = mockClient([]);
        const {root, error} = getPayboardElements();
        const payboard = new Payboard(root, error, mc, {userId: '123abbc'}, false);
        await payboard.init();
        expect(mc.getEarningsForUser).not.toHaveBeenCalled();
        expect(mc.getEarningsForSelf).toHaveBeenCalledTimes(1);
    });

    it("should work when there are no earnings", async () => {
        await testPayboard([]);
    });

    it("should display breath earnings from multiple days correctly", async () => {
        const earnings = [
            {type: earningsTypes.BREATH1, date: '2023-01-01', amount: 7},
            {type: earningsTypes.BREATH2, date: '2023-01-01', amount: 7},
            {type: earningsTypes.BREATH1, date: '2023-01-02', amount: 7}
        ];
        await testPayboard(earnings);
    });

    it("should display streak bonus earnings when they exist", async () => {
        const earnings = [
            {type: earningsTypes.BREATH1, date: '2023-01-01', amount: 7},
            {type: earningsTypes.BREATH2, date: '2023-01-01', amount: 7},
            {type: earningsTypes.STREAK_BONUS1, date: '2023-01-01', amount: 3}
        ];
        await testPayboard(earnings);
    });

    it("should display streak bonus 2 earnings when they exist ", async () => {
        const earnings = [
            {type: earningsTypes.BREATH1, date: '2023-01-01', amount: 7},
            {type: earningsTypes.BREATH2, date: '2023-01-01', amount: 7},
            {type: earningsTypes.STREAK_BONUS2, date: '2023-01-01', amount: 5}
        ];
        await testPayboard(earnings);
    });

});

function getPayboardElements() {
    return {
        root: document.querySelector("#root"),
        error: document.querySelector("#error"),
    };
}

async function testPayboard(earnings) {
    const mc = mockClient(earnings);
    const {root, error} = getPayboardElements();
    const payboard = new Payboard(root, error, mc, {userId: '123abbc'}, false);
    await payboard.init();
    expectPayboardMatches(payboard, earnings);
}
