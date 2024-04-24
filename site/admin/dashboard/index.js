import "./style.css";
import { getAuth } from "auth/auth.js";
import ApiClient from "../../../common/api/client";
import { Dashboard } from "./dashboard";

getAuth(
    async session => {
        const client = new ApiClient(session);
        const dash = new Dashboard(document.querySelector("#dashboard > tbody"), document.getElementById("user-details"), client);
        await dash.init();
    },
    err => console.error(err)
).getSession();