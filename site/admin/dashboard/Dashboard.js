import tableTmpl from "./templates/table.handlebars";
import userDetailsTmpl from "./templates/userDetails.handlebars";
import statusTmpl from "./templates/status.handlebars";
import { DatedCheckbox } from "./DatedCheckbox";
import { Payboard } from "../../../common/pay-info/pay-info";

export class Dashboard {
    constructor(tbody, userDetailsDiv, apiClient) {
        this.tbody = tbody;
        this.userDetailsDiv = userDetailsDiv;
        this.apiClient = apiClient;
        this.users = {};
        this.hasLoadedAllUsers = false;
    }

    async init() {
        await this.loadUsers('active'); // defaults to active only
        this.tbody.addEventListener("click", async event => {
            const target = event.target;
            if (target.type == "checkbox") {
                await this.handleCheckboxEvent(event);
            } else if (target.className == "username") {
               await this.handleUserEvent(event);
            }
            return;
        });

        this.tbody.addEventListener("change", async event => {
            const target = event.target;
            if (target.type == "datetime-local") {
                await this.handleDateFieldEvent(event);
            }
        });

        const debounce = (callback, waitTime) => {
            let timer
            return (...args) => {
                clearTimeout(timer)
                timer = setTimeout(() => callback(...args),waitTime);
            }
        }

        this.tbody.addEventListener("input", debounce(async (event) => {
            event.target.classList.remove('error');
            const userId = event.target.closest("tr")?.dataset.userId;
            const participantId = event.target.textContent;
            if (!this.isValidParticipantId(participantId)) {
                event.target.classList.add('error');
                alert(`${participantId} is not a valid participant id.`);
                return;
            }

            await this.apiClient.updateUser(userId, {participantId: participantId});
            const user = this.users[userId];
            user['participantId'] = participantId;
        }, 1500));

        this.userDetailsDiv.addEventListener("click", async event => {
            await this.handleDetailsClickEvent(event)
        });

        // handle tab clicks
        document.querySelector("div.tabs").addEventListener("click", async event => {
            if (event.target.textContent !== 'Active' && event.target.textContent !== 'All') return;

            if (!this.hasLoadedAllUsers && event.target.textContent === 'All') {
                await this.loadUsers('all');
                this.hasLoadedAllUsers = true;
                this.fetchStatusForUsers();
            }

            const inactiveRows = document.querySelectorAll('tr[data-inactive="true"]');
            for (let i=0; i< inactiveRows.length; i++) {
                const r = inactiveRows[i];
                if (event.target.textContent == 'Active'){
                    r.classList.add("hidden");
                } else {
                    r.classList.remove("hidden");
                }
            }
        });

        this.fetchStatusForUsers();
    }

    isValidParticipantId(id) {
        return id && id.match(/[0-9]{4}[A-z]?/);
    }

    async loadUsers(userType) {
        if (userType !== 'active' && userType !== 'all') {
            throw new Error(`Expected userType to be 'active' or 'all', but got '${userType}'.`);
        }
        let users;
        if (userType === 'active') {
            users = await this.apiClient.getInProgressParticipants();
        } else {
            users = await this.apiClient.getAllParticipants();
        }
        const displayInfo = [];
        for (const u of users) {
            this.users[u.userId] = u;
            displayInfo.push(
                {
                    userId: u.userId,
                    participantId: u.participantId,
                    name: u.name,
                    email: u.email,
                    phone: u.phone,
                    dropped: new DatedCheckbox('dropped', u.progress ? u.progress.dropped : null),
                    inactive: u.progress && (u.progress.dropped || u.progress.stage3Complete)
                }
            );
        }
        
        this.tbody.innerHTML = tableTmpl({users: displayInfo});
    }

    async handleCheckboxEvent(event) {
        const {key, date, origDateStr} = DatedCheckbox.handleClick(event);
        const checkbox = event.target;
        checkbox.disabled = true;
        const userId = checkbox.closest("tr")?.dataset.userId;
        try {
            const dateStr = date ? date.format("YYYY-MM-DDTHH:mm:ssZ") : null;
            await this.updateUserProgress(userId, key, dateStr);
        } catch (err) {
            DatedCheckbox.undoClick(event, origDateStr);
            console.error(`Error setting date for ${key} for ${userId}`, err);
            window.alert("A problem ocurred. Please try again later.");
            event.preventDefault();
        } finally {
            checkbox.disabled = false;
        }
    }

    async handleDateFieldEvent(event) {
        const dateField = event.target;

        const {key, datetime} = FutureDateField.handleChange(event);
        const userId = dateField.closest("tr")?.dataset.userId;
        dateField.disabled = true;
        try {
            await this.updateUserProgress(userId, key, datetime.format("YYYY-MM-DDTHH:mm:ssZ"));
        } catch (err) {
            event.preventDefault();
            console.error(`Error setting visit 2 scheduled date for ${userId}`, err);
            window.alert("A problem ocurred. Please try again later.");
            const user = this.users[userId];
            const origDateStr = user.progress ? user.progress.visit2Scheduled : null;

            // this is stupid, but for some reason (webpack bug?)
            // setting dateField.value directly here will trigger
            // a new change event
            setTimeout(() => dateField.value = origDateStr, 100)
        } finally {
            dateField.disabled = false;
        }
    }

    async updateUserProgress(userId, key, value) {
        await this.refreshUser(userId);
        const user = this.users[userId];
        const progress = user.progress ?? {};
        if (value) {
            progress[key] = value;
        } else {
            progress[key] = null;
        }
        await this.apiClient.updateUser(userId, {progress});
    }

    async handleUserEvent(event) {
        const parentRow = event.target.closest("[data-user-id]");
        const userId = parentRow.dataset.userId;
        const user = this.users[userId];
        const dispUser = {
            userId: user.userId,
            phone: user.phone_number,
            email: user.email
        };

        this.userDetailsDiv.innerHTML = userDetailsTmpl({user: dispUser});
        const payInfoDiv = document.getElementById("pay-info");
        const payErrsDiv = document.getElementById("pay-errors");
        const payboard = new Payboard(payInfoDiv, payErrsDiv, this.apiClient, userId, true);
        await payboard.init();
        this.userDetailsDiv.classList.remove("hidden");
    }

    async handleDetailsClickEvent(event) {
        if (event.target.id !== "close-button") {
            event.stopPropagation();
            return false;
        }
        if (!this.userDetailsDiv.classList.contains("hidden")) {
            this.userDetailsDiv.classList.add("hidden");
        }
    }

    async refreshUser(userId) {
        this.users[userId] = await this.apiClient.getUser(userId, true);
    }

    async fetchStatusForUsers() {
        for (const userId of Object.keys(this.users)) {
            const status = await this.apiClient.getUserStatus(userId);
            const userRow = document.querySelectorAll(`[data-user-id="${userId}"]`)[0]; // TODO handle case where we don't find the user row
            const startDateCell = userRow.querySelectorAll(".start-date")[0];
            startDateCell.innerHTML = status.startDate;
            const status2Cell = userRow.querySelectorAll(".status2")[0];
            status2Cell.innerHTML = statusTmpl({status: status.status2, total: 12});
            const status3Cell = userRow.querySelectorAll(".status3")[0];
            status3Cell.innerHTML = statusTmpl({status: status.status3, total: 48});
        }
    }

}