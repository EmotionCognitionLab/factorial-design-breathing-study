import awsSettings from '../aws-settings.json';

export default class ApiClient {
    constructor(session) {
        this.idToken = session.getIdToken().getJwtToken();
    }

    async getEarningsForUser(userId, earningsType) {
        let url = `${awsSettings.AdminApiUrl}/participant/${userId}/earnings/`;
        if (earningsType) url += earningsType;
        return await this.doFetch(url, "get", "There was an error retrieving earnings for the user");
    }

    /**
     * Fetches the user record for the logged-in user.
     * @returns {object} A user record
     */
    async getSelf() {
        const url = `${awsSettings.UserApiUrl}`;
        return await this.doFetch(url, "get", "There was an error getting the user record");
    }
    
    /**
     * Fetches a user record.
     * @param {string} userId The id of the user whose record is to be fetched.
     * @param {boolean} consistentRead Should the fetch use a consistent read?
     * @returns {object} A user record
     */
    async getUser(userId, consistentRead = false) {
        let url =  `${awsSettings.AdminApiUrl}/participant/${userId}`;
        if (consistentRead) {
            url += "?consistentRead=true";
        }
        return await this.doFetch(url, "get", "There was an error retrieving the user data");
    }

    async getEarningsForSelf(earningsType) {
        let url = `${awsSettings.UserApiUrl}/earnings/`;
        if (earningsType) url += earningsType;
        return await this.doFetch(url, "get", "There was an error retrieving the earnings for the user");
    }

    /**
     * Updates the record of the logged-in user.
     * @param {object} updates An object with the fields you want to update and the values you want to set them to
     * @returns {object} DynamoDb.DocumentClient.update response. (https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#update-property)
     */
    async updateSelf(updates) {
        const url = `${awsSettings.UserApiUrl}`;
        return await this.doFetch(url, "put", "There was an error updating the user record", updates );
    }

    /**
     * Updates an existing user record.
     * @param {string} userId The id of the user whose record is to be updated
     * @param {object} updates An object with the fields you want to update and the values you want to set them to
     * @returns {object} DynamoDb.DocumentClient.update response. (https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html#update-property)
     */
    async updateUser(userId, updates) {
        const url = `${awsSettings.AdminApiUrl}/participant/${userId}`;
        return await this.doFetch(url, "put", `There was an error updating user ${userId}`, updates);
    }

    /**
     * 
     * @returns All participants in the database
     */
    async getAllParticipants() {

        const url = `${awsSettings.AdminApiUrl}/participants/all`;
        return await this.doFetch(url, "get", "There was an error fetching participants");
    }

    /**
     * 
     * @returns All in-progress (have not finished or been dropped from experiment) participants in the database
     */
    async getInProgressParticipants() {
        const url = `${awsSettings.AdminApiUrl}/participants/active`;
        return await this.doFetch(url, "get", "There was an error fetching in-progress participants");
    }

    /**
     * Returns the status of the user, which describes how well they're keeping up with the study.
     * It is the number of days on which they have done >=3 breathing segments.
     * @param {string} userId 
     */
    async getUserStatus(userId) {
        const url = `${awsSettings.AdminApiUrl}/participant/${userId}/status`
        return await this.doFetch(url, "get", `There was an error getting the status for user ${userId}`);
    }

    async registerUser(name, email, phone, password) {
        const url = `${awsSettings.RegistrationApiUrl}`;
        const params = {
            name: name,
            email: email,
            phone: phone,
            password: password
        };
        return await this.doFetch(url, "post", "An error occurred during registration", params);
    }

    /**
     * Given an array of inter-beat intervals (IBI), in ms, returns peak values in two
     * different frequency ranges, "slow" and "slower", from a spectral frequency analysis.
     * The return value is an array containing a single object with the fields "slowX",
     * "slowY", "slowerX", and "slowerY".
     * @param {Number[]} ibiData 
     * @returns {Object[]}
     */
    async getHRVAnalysis(ibiData) {
        const url = awsSettings.HrvApiUrl;
        return await this.doFetch(url, "post", "An error occurred doing the HRV analysis", ibiData)
    }

    async doFetch(url, method, errPreamble, body = null) {
        const init = {
            method: method,
            mode: "cors",
            cache: "no-cache",
            headers: {
                "Content-type": "application/json",
                "Authorization": this.idToken,
            },
        };
        if (body) init.body = JSON.stringify(body);

        try {
            const response = await fetch(url, init);

            if (!response.ok) {
                const respText = await response.text();
                throw new Error(`${errPreamble}: ${respText} (status code: ${response.status})`);
            }
            return await response.json();
        } catch (err) {
            console.error(errPreamble, err);
            throw err;
        }
        
    }
}

