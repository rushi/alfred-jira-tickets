## Alfred Workflow for JIRA

Shows you your JIRA tickets in Alfred and allow you to jump to the ticket in the browser

Copy `.env.default` to `.env` and populate it with information. Then run `node -r esm index.js -update` flag to populate `cache.json`

You should know how to set up an Alfred Workflow from scratch. If not, contact me.

Requires:
* Node v12
* An API Key for JIRA from https://id.atlassian.com/manage-profile/security/api-tokens
