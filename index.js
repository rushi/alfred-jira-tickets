#!/usr/bin/env node

import _ from "lodash";
import fs from "fs";
import path from "path";
import alfy from "alfy";
import moment from "moment";
import {ray} from 'node-ray';
import shell from "shelljs";
import { JIRA } from "./jira";

const dotenv = require("dotenv");
dotenv.config({ path: path.dirname(fs.realpathSync(process.argv[1])) + "/.env" });

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
    let data = alfy.cache.get(cacheKey, { ignoreMaxAge: true });
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

    const input = alfy.input ? alfy.input : "/hours 24";
    ray(`Start with ${input}`);
    let items = [];
    if (input.match(/\/new( \d{1,3})?/)) {
        const matches = input.match(/\d{1,3}/);
        const max = matches ? matches[0] : 10;
        items = data.slice(0, max);
    } else if (input.match(/\/hours (\d{1,3})/)) {
        const hours = input.match(/\d{1,3}/)[0];
        const limit = moment().subtract(hours, "hours");
        items = data.filter((d) => moment(d.createdAt).isAfter(limit));
    } else if (input === "/critical") {
        items = data.filter((d) => d.priority.match(/critical/i));
    } else if (input === "/rtd") {
        items = data.filter((d) => d.subtitle.match(/ready to/i));
    } else {
        const re = new RegExp(input.trim(), "i");
        items = data.filter((d) => d.title.match(re));
    }

    if (_.isEmpty(items)) {
        const searchPath = JIRA.getIssueUrl(input); // Manually look up on JIRA search
        items = [{ title: `No tickets found for '${input}'`, subtitle: `Search for ${input}`, arg: searchPath }];
    }

    alfy.output(items);
    initCacheData();
}

function initCacheData() {
    var spawn = require("child_process").spawn;
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
        console.log(results.length + " tickets cached in " + alfy.cache.path);
        console.log(results[0], results[results.length - 1]);
    } catch (err) {
        console.log("Error getting tickets");
        console.log(err);
    }

    shell.rm(lockfile);

    return results;
}

run();
