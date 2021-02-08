import fs from "fs";
import _ from "lodash";
import path from "path";
import moment from "moment";
import JiraApi from "jira-client";

const dotenv = require("dotenv");
dotenv.config({ path: path.dirname(fs.realpathSync(process.argv[1])) + "/.env" });

const config = {
    protocol: "https",
    host: process.env.JIRA_HOST,
    apiVersion: process.env.JIRA_API_VERSION,
    username: process.env.JIRA_USERNAME,
    password: process.env.JIRA_PASSWORD,
};
const jira = new JiraApi(config);

const issueFields = ["summary", "status", "assignee", "issuetype", "priority", "reporter", "fixVersions", "created"];

export const JIRA = {
    async findAllTickets(limit = 99999) {
        const projectList = process.env.PROJECT_LIST;
        const jql = `status != Closed and status != Done and project in (${projectList}) ORDER by createdDate DESC`;
        const response = await this.searchByJQL(jql, 0, limit);
        let formattedTickets = response.issues.map((issue) => {
            const fields = issue.fields;
            const type = fields.issuetype.name;
            const title = `${type} ${issue.key} - ${fields.summary}`;
            const status = fields.status ? fields.status.name : "Status N/A";
            const priority = fields.priority ? fields.priority.name : "Priority N/A";
            const createdAt = moment(fields.created).format("Do MMM, YYYY HH:mm");
            const subtitle = `${status} 🔹 ${priority} by ${fields.reporter.displayName} on ${createdAt}`;

            const isTask = type === "task";
            return {
                title,
                subtitle,
                priority,
                createdAt: fields.created,
                arg: this.getIssueUrl(issue.key),
                icon: {
                    path: type === "Bug" ? "./images/bug.png" : isTask ? "./images/task.png" : "./images/story.png",
                },
            };
        });

        return formattedTickets;
    },

    async searchByJQL(jql, startAt = 0, maxResults = 999, expand = []) {
        expand = _.isArray(expand) ? expand : [expand];
        let results = await jira.searchJira(jql, { startAt, expand, fields: issueFields, maxResults });
        if (results.startAt + results.maxResults < results.total && startAt < maxResults) {
            const response = await this.searchByJQL(jql, startAt + 100, maxResults, expand);
            results.issues = results.issues.concat(response.issues);
        }

        return results;
    },

    getIssueUrl(key) {
        return `https://${config.host}/browse/${key}`;
    },
};
