import fs from "fs";
import JiraApi from "jira-client";
import _ from "lodash";
import moment from "moment";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: `${path.dirname(fs.realpathSync(process.argv[1]))}/.env` });

const config = {
    protocol: "https",
    host: process.env.JIRA_HOST,
    apiVersion: process.env.JIRA_API_VERSION,
    username: process.env.JIRA_USERNAME,
    password: process.env.JIRA_PASSWORD,
};
const jira = new JiraApi(config);

const issueFields = ["summary", "status", "assignee", "issuetype", "priority", "reporter", "fixVersions", "created"];

const getStatus = (status) => {
    const name = status ? status.name : "Status N/A";
    if (name.match(/in progress/i)) {
        return `⏳ ${name}`;
    }
    if (name.match(/ready to deploy|done/i)) {
        return `✅ ${name}`;
    }
    if (name.match(/closed/i)) {
        return `🏁 ${name}`;
    }
    return name;
};

export const JIRA = {
    async findAllTickets(limit = 99_999) {
        const projectList = process.env.PROJECT_LIST;
        const jql = `project in (${projectList}) AND updatedDate >= -60d ORDER by createdDate DESC`;
        console.log("JQL", jql);
        const response = await this.searchByJQL(jql, 0, limit);
        const formattedTickets = response.issues.map((issue) => {
            const fields = issue.fields;
            const type = fields.issuetype.name;
            const title = `${type} ${issue.key} - ${fields.summary}`;
            const status = getStatus(fields.status);
            const priority = fields.priority ? fields.priority.name : "Priority N/A";
            const assignee = fields.assignee ? fields.assignee.displayName : "N/A";
            const createdAt = moment(fields.created).format("Do MMM YYYY HH:mm");
            const subtitle = `${status} 🔹 ${priority} by ${fields.reporter.displayName} on ${createdAt}`;

            const isStoryLike = type === "Story" || type === "Improvement";
            const modSubtitle = `Created ${moment(fields.created).fromNow()} - Assigned to: ${assignee}`;
            return {
                uid: issue.key,
                title,
                subtitle,
                priority,
                createdAt: fields.created,
                arg: this.getIssueUrl(issue.key),
                text: { copy: this.getIssueUrl(issue.key), largetype: title },
                mods: { alt: { subtitle: modSubtitle }, cmd: { subtitle: modSubtitle } },
                icon: {
                    path: type.match(/bug/i) ? "images/bug.png" : isStoryLike ? "images/story.png" : "images/task.png",
                },
            };
        });

        return formattedTickets;
    },

    async searchByJQL(jql, startAt = 0, maxResults = 999, expand = []) {
        expand = _.isArray(expand) ? expand : [expand];
        const results = await jira.searchJira(jql, { startAt, expand, fields: issueFields, maxResults });
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
