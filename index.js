import alfy from "alfy";
import { spawn } from "child_process";
import consola from "consola";
import dotenv from "dotenv";
import fs from "fs";
import Fuse from "fuse.js";
import _ from "lodash";
import moment from "moment";
import path from "path";
import shell from "shelljs";
import { JIRA } from "./jira.js";

consola.wrapConsole();

dotenv.config({ path: `${path.dirname(fs.realpathSync(process.argv[1]))}/.env` });

const cacheKey = process.env.CACHE_KEY;
const cacheAge = 1800 * 1000; // 120 seconds to milliseconds
alfy.cache.path = process.env.CACHE_PATH;

const lockfile = "/tmp/alfred.jira.lock";
const args = process.argv.slice(2);
const forcedUpdate = args[0] && args[0] === "--update";

async function isLocked() {
    const fileExists = shell.test("-f", lockfile);
    if (!fileExists) {
        return false;
    }

    const fd = await fs.openSync(lockfile);
    const stats = await fs.fstatSync(fd);
    const diffSeconds = moment().unix() - stats.birthtimeMs / 1000;
    fs.close(fd);

    const staleLockFile = diffSeconds < 3600;
    shell.rm(lockfile);

    return staleLockFile;
}

async function run() {
    const data = alfy.cache.get(cacheKey, { ignoreMaxAge: true });
    if (_.isEmpty(data) || forcedUpdate) {
        // No data in the store, must cache

        if (await isLocked()) {
            // Lockfile exists, not updating
            return output("Caching in progress", `Try '${alfy.input}' again in a few`);
        } else if (forcedUpdate) {
            const results = await cacheData();
            return output("Caching data complete", `Found ${results.length} results`);
        } else {
            initCacheData();
            return output("Caching started", `Try '${alfy.input}' again in a few`);
        }
    }

    let items = [];
    const input = alfy.input ?? "/hours 24";
    if (input.match(/\/new( \d{1,3})?/)) {
        // Show "/new <num>" to show the latest <num> tickets
        const matches = input.match(/\d{1,3}/);
        const max = matches ? matches[0] : 10;
        items = data.slice(0, max);
    } else if (input.match(/\/hours (\d{1,3})/)) {
        // Show "/hours <num>" to show tickets created in last <num> hours
        const hours = input.match(/\d{1,3}/)[0];
        const limit = moment().subtract(hours, "hours");
        items = data.filter((d) => moment(d.createdAt).isAfter(limit));
    } else if (input === "/critical") {
        items = data.filter((d) => d.priority.match(/critical/i));
    } else if (input === "/rtd") {
        items = data.filter((d) => d.subtitle.match(/ready to|done/i));
    } else {
        const options = { includeScore: true, keys: ["uid", "title"], minMatchCharLength: 4 };
        const fuse = new Fuse(data, options);
        const result = fuse.search(input);
        let hasExactMatch = false;
        let lowestScore = 1;
        items = result
            .map((r) => {
                r.item.score = _.round(r.score, 2);
                r.item.subtitle += ` Score: ${r.item.score}`;
                if (r.item.score < lowestScore) {
                    lowestScore = r.item.score;
                }
                if (r.item.uid === input) {
                    hasExactMatch = true;
                }
                return r.item;
            })
            .slice(0, 5);
        if (!hasExactMatch) {
            items.unshift({
                title: `Open ${input} in browser`,
                subtitle: `Issue not found`,
                arg: `https://xola01.atlassian.net/browse/${input}`,
                icon: { path: "icons/browser.png" },
            });
        }
    }

    if (_.isEmpty(items)) {
        const searchPath = JIRA.getIssueUrl(input); // Manually look up on JIRA search
        items = [{ title: `No tickets found for '${input}'`, subtitle: `Search for ${input}`, arg: searchPath }];
    }

    // console.log(items);
    alfy.output(items, { rerunInterval: 5 });
    // initCacheData();
}

function initCacheData() {
    spawn("node", ["index.js", "--update"], {
        stdio: "ignore",
        detached: true,
    }).unref();
}

function output(title, subtitle = "") {
    alfy.output([{ title, subtitle }]);
}

async function cacheData() {
    console.log("Caching data...");
    shell.touch(lockfile);

    let results = [];
    try {
        results = await JIRA.findAllTickets();
        alfy.cache.set(cacheKey, results, { maxAge: cacheAge });
        console.log(`${results.length} tickets cached in ${alfy.cache.path}`);
        console.log(results[0], results[results.length - 1]);
    } catch (err) {
        console.log("Error getting tickets");
        console.log(err);
    }

    shell.rm(lockfile);

    return results;
}

run();
