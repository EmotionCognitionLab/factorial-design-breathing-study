import { earningsTypes, earningsAmounts } from "../../types/types.js";
import { Payboard } from "../pay-info.js";

const mockClient = (earnings) => ({
    getEarningsForUser: jest.fn(userId => earnings),
    getEarningsForSelf: jest.fn(() => earnings)
});

function earningsToRows(earnings) {
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

    return templateData;
}

function expectPayboardMatches(payboard, earnings) {

    const expectedRows = earningsToRows(earnings);

    const rows = payboard.rootDiv.querySelectorAll("tbody tr");
    expect(rows.length).toBe(expectedRows.length + 1);

    const expDollarStr = (item) => {
        return item ? `$${item}` : '$0';
    }

    let overallTotal = 0;
    for (let i=0; i<rows.length - 1; i++) {
        const curRow = rows[i];
        const dayCell = curRow.children[0];
        const visitsCell = curRow.children[1];
        const sessionsCell = curRow.children[2];
        const bonusesCell = curRow.children[3];
        const totalCell = curRow.children[4];
        
        const expRow = expectedRows[i];
        expect(dayCell.innerHTML).toBe(expRow['day']);
        expect(visitsCell.innerHTML).toBe(expDollarStr(expRow['visits']));
        expect(sessionsCell.innerHTML).toBe(expDollarStr(expRow['sessions']));
        expect(bonusesCell.innerHTML).toBe(expDollarStr(expRow['bonuses']));
        expect(totalCell.innerHTML).toBe(expDollarStr(expRow['total']));
        overallTotal += expRow['total'];
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
            {type: earningsTypes.BREATH1, date: '2023-01-01', amount: earningsAmounts[earningsTypes.BREATH1]},
            {type: earningsTypes.PERFORMANCE_BREATH2, date: '2023-01-01', amount: earningsAmounts[earningsTypes.PERFORMANCE_BREATH2]},
            {type: earningsTypes.BREATH1, date: '2023-01-02', amount: earningsAmounts[earningsTypes.BREATH1]}
        ];
        await testPayboard(earnings);
    });

    it("should display performance bonus earnings when they exist", async () => {
        const earnings = [
            {type: earningsTypes.BREATH1, date: '2023-01-01', amount: earningsAmounts[earningsTypes.BREATH1]},
            {type: earningsTypes.PERFORMANCE_BREATH2, date: '2023-01-01', amount: earningsAmounts[earningsTypes.PERFORMANCE_BREATH2]},
            {type: earningsTypes.TOP_66, date: '2023-01-01', amount: earningsAmounts[earningsTypes.TOP_66]}
        ];
        await testPayboard(earnings);
    });

    it("should display completion streak bonus earnings when they exist ", async () => {
        const earnings = [
            {type: earningsTypes.BREATH1, date: '2023-01-01', amount: earningsAmounts[earningsTypes.BREATH1]},
            {type: earningsTypes.COMPLETION_BREATH2, date: '2023-01-01', amount: earningsAmounts[earningsTypes.COMPLETION_BREATH2]},
            {type: earningsTypes.STREAK_BONUS, date: '2023-01-01', amount: earningsAmounts[earningsTypes.STREAK_BONUS]}
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
