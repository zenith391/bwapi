/**
	bwapi - Blocksworld API server reimplementation
    Copyright (C) 2020 zenith391

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/
import fs from "fs";
import multiparty from "multiparty";
import bodyParser from "body-parser";
import util from "util";
import serverline from "serverline";
import Redis from "ioredis";
import express from "express";
import compression from "compression";
import path from 'path';
import { fileURLToPath } from 'url';

import { User } from "./users.js";
import { run } from "./bwwool.js";

global.__filename = fileURLToPath(import.meta.url);
global.__dirname = path.dirname(__filename);

// you *MUST* change this to the address of your server (otherwise some features like thumbnails won't work) !
global.HOST = "https://bwsecondary.ddns.net:8080";
global.ROOT_NAME = path.dirname(__dirname);
// is this server early access? (used for some status identifiers)
global.EARLY_ACCESS = true;
global.VERSION = "0.9.1";
// how many worlds each player can have
global.MAX_WORLD_LIMIT = 200;

global.authTokens = {};
global.capabilities = {
	"bwapi": {
		"version": VERSION
	}
}; // for modded

const fileOptions = {
	root: __dirname
}

const app = express();

// Utility Functions //

// Get the auth token from a request object
global.getAuthToken = function(req) {
	let authToken = undefined;
	console.debug("get auth token, headers are:");
	console.debug(req.headers);
	if (req.headers["bw-auth-token"] !== undefined) {
		authToken = req.headers["bw-auth-token"];
	}
	return authToken;
}

// just internally used helper functions
global.value2 = function(v) {
	if (typeof(v) == "object") {
		return v[0];
	} else {
		return v;
	}
}

// Internally used
global.value = function(body, name) {
	let v = body[name];
	if (typeof(v) == "object") {
		return v[0];
	} else {
		return v;
	}
}

// Function used to validate an user's auth token and get to whom it belongs.
global.validAuthToken = function(req, res, bodyCheck) {
	let authToken = getAuthToken(req);
	if (authToken === undefined) {
		res.status(405).json({
			"error": 405,
			"error_msg": "missing authentication token"
		});
		return { ok: false };
	}
	let userId = authTokens[authToken];
	if (userId == undefined) {
		res.status(405).json({
			"error": 405,
			"error_msg": "unauthentificated user"
		});
		return { ok: false };
	}
	if (bodyCheck && (req.body == undefined || req.body == null)) {
		res.status(400).json({
			"error": "no body"
		});
		return { ok: false };
	}
	return {
		ok: true,
		user: new User(userId),
		authToken: authToken
	};
}

// Helper function for ISO date formatting
function datePart(num) {
	let str = num.toString();
	if (str.length < 2) {
		str = "0" + str;
	}
	return str;
}

// Format a 'Date' object in ISO format.
global.dateString = function(date) {
	if (date === undefined || date === null) {
		date = new Date(); // default to current date
	}
	let currDateStr = 
		date.getUTCFullYear()
		+ '-'
		+ datePart(date.getUTCMonth() + 1)
		+ '-'
		+ datePart(date.getUTCDate()) + 'T'
		+ datePart(date.getUTCHours()) + ':'
		+ datePart(date.getUTCMinutes()) + ':'
		+ datePart(date.getSeconds()) + "+00:00"
	return currDateStr;
}

app.use(compression());

app.use(function(req, res, next) {
	// Log queries
	let authToken = getAuthToken(req);
	let userId = undefined;
	if (authToken !== undefined) {
		userId = authTokens[authToken];
	}
	console.debug(req.method + " " + req.url, userId);

	res.set("Server", "Vaila");
	res.set("Access-Control-Allow-Origin", "*"); // allows client JavaScript code to access bwapi
	try {
		next();
	} catch (e) {
		console.error("Request failed (" + req.url + ")");
		console.error("Error name: " + e.name);
		console.error("Error message: " + e.message);
		console.error(e.stack);
	}
});

app.disable("x-powered-by"); // as recommended by ExpressJS security best practices (https://expressjs.com/en/advanced/best-practice-security.html)

app.use(function(req, res, next) {
	if (req.headers["content-type"] != undefined) {
		if (req.headers["content-type"].indexOf("multipart/form-data") != -1) {
			// The request is in HTTP form data which the 'multiparty' package can parse.
			let form = new multiparty.Form();
			form.maxFieldsSize = 1024*1024*16; // 16 MiB
			form.parse(req, function(err, fields, files) {
				if (err) {
					console.error(err);
				}
				req.body = fields;
				req.files = files;
				next();
			});
		} else if (req.headers["content-type"].indexOf("application/json") != -1) {
			// The request is in JSON format which 'bodyParser' package can parse.
			bodyParser.json({"limit":"50mb"})(req, res, next);
		} else if (req.headers["content-type"].indexOf("application/x-www-form-urlencoded") != -1) {
			// The request is URL-encoded which 'bodyParser' package can parse.
			req.files = {};
			bodyParser.urlencoded({"extended":false, "limit": "50mb"})(req, res, next);
		} else {
			next();
		}
	} else {
		next();
	}
});

// Init every modules
let cores = fs.readdirSync("modules");
for (const i in cores) {
	let file = cores[i];
	if (file != "app.js") {
		const userModule = await import("./" + file);
		if (userModule.run) {
			console.debug("Init module " + file);
			userModule.run(app);
		}
	}
}

// Plain file hosting //

// Minify files at start of the program so they don't have to be minified each time.
const steamRemoteConf = JSON.stringify(JSON.parse(fs.readFileSync("conf/steam_app_remote_configuration.json")));
app.get("/api/v1/steam-app-remote-configuration", function(req, res) {
	res.status(200).send(steamRemoteConf);
});

const iosRemoteConf = JSON.parse(fs.readFileSync("conf/app_remote_configuration.json"));
app.get("/api/v1/app-remote-configuration", function(req, res) {
	res.status(200).json(iosRemoteConf);
});

let contentCategories = JSON.stringify(JSON.parse(fs.readFileSync("conf/content_categories.json")));
app.get("/api/v1/content-categories-no-ip", function(req, res) {
	res.status(200).send(contentCategories);
});
app.get("/api/v1/content-categories", function(req, res) {
	res.status(200).send(contentCategories);
});

let blocksPricings = JSON.stringify(JSON.parse(fs.readFileSync("conf/blocks_pricings.json")));
app.get("/api/v1/block_items/pricing", function(req, res) {
	res.status(200).send(blocksPricings);
});

let coinPacks = JSON.stringify(JSON.parse(fs.readFileSync("conf/coin_packs.json")));
app.get("/api/v1/store/coin_packs", function(req, res) {
	res.status(200).send(coinPacks);
});

app.use("/images", express.static("images", { extensions: ['png', 'jpg'], maxAge: '5m' })); // Serve the 'images' folder

// Default handler that only acts if a non-existent endpoint is requested
app.all("/api/v1/*", function(req, res) {
	res.status(404).json({
		"error": "404",
		"error_msg": "Not Found",
		"error_details": "This API endpoint has no route handler."
	});
});

// /api/v2 is an API dedicated to mods.
app.all("/api/v2/*", function(req, res) {
	res.status(404).json({
		"error": "404",
		"error_msg": "Missing or invalid API endpoint",
		"error_details": "The API endpoint is missing from the URL or is invalid."
	});
});

// Mimics BW1 behaviour by sending 'Forbidden' HTTP status code on every URL not starting by /api/v1/ (and by /api/v2/)
app.all("*", function(req, res) {
	res.set("Content-Type", "text/plain");
	res.status(403).send("Forbidden");
});

export default app;
