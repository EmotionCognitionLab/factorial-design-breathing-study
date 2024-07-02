import tableTmpl from "./templates/table.handlebars";
import userDetailsTmpl from "./templates/userDetails.handlebars";
import { Payboard } from "../../../common/pay-info/pay-info";
import { statusTypes } from "../../../common/types/types";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
dayjs.extend(utc);
dayjs.extend(timezone);

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
            if (target.className == "username") {
               await this.handleUserEvent(event);
            }
            return;
        });

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
                    name: u.name,
                    userId: u.userId,
                    inactive: !u.progress?.status || u.progress.status != statusTypes.ACTIVE
                }
            );
        }
        
        this.tbody.innerHTML = tableTmpl({users: displayInfo});
    }

    async handleUserEvent(event) {
        const parentRow = event.target.closest("[data-user-id]");
        const userId = parentRow.dataset.userId;
        const user = this.users[userId];
        const today = dayjs().tz('America/Los_Angeles');
        // status is based on past three days, starting yesterday
        const statusStart = today.subtract(4, 'days').startOf('day');
        const statusEnd = today.subtract(1, 'days').endOf('day');
        const dateRange = `${statusStart.format('MM/DD/YYYY')}-${statusEnd.format('MM/DD/YYYY')}`;
        const dispUser = {
            userId: user.userId,
            phone: user.phone_number,
            email: user.email,
            status: user.status,
            dateRange: dateRange
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
        for (const u of Object.values(this.users)) {
            const userRow = document.querySelectorAll(`[data-user-id="${u.userId}"]`)[0]; // TODO handle case where we don't find the user row
            const statusCell = userRow.querySelectorAll(".status")[0];
            statusCell.innerHTML = '';
            if (u.progress?.status !== statusTypes.ACTIVE) {
                if (!u.progress?.status) {
                    statusCell.classList.add("dot", "empty");
                } else if (u.progress.status === statusTypes.DROPPED) {
                    statusCell.classList.add("dot", "gray");
                } else if (u.progress.status === statusTypes.COMPLETE) {
                    statusCell.classList.add("dot", "blue");
                }
                continue;
            }
            

            const status = await this.apiClient.getUserStatus(u.userId);
            u.status = status;
            if (status.recentMinutes >= 72) {
                statusCell.classList.add("dot", "green");
            } else if (status.recentMinutes >= 36 && status.recentMinutes <= 71) {
                statusCell.classList.add("dot", "yellow");
            } else {
                statusCell.classList.add("dot", "red");
            }
        }
    }

}