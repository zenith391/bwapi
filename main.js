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

const https = require("https");
const http = require("http");
const fs = require("fs");
const multiparty = require("multiparty");
const bodyParser = require("body-parser");
const util = require("util");
const serverline = require("serverline");

HOST = "https://bwsecondary.ddns.net:8080"; // you *MUST* change this to the address of your server (otherwise some things like thumbnails won't work) !
ROOT_NAME = __dirname;
EARLY_ACCESS = true; // is this server early access? (used for some status identifiers)
VERSION = "0.9.1";
// how many worlds each player can have
MAX_WORLD_LIMIT = 200;

authTokens = {};
capabilities = {
	"bwapi": {
		"version": VERSION
	}
}; // for modded

let useHttps = true;

if (!fs.existsSync("cert")) {
	console.error("Missing 'cert' directory. Please refer to the 'README.md' for more details on how to setup.");
	console.error("Launching bwapi in http mode");
	useHttps = false;
}

let options = {};
if (useHttps) {
	options = {
		key: fs.readFileSync("cert/privkey.pem"),
		cert: fs.readFileSync("cert/fullchain.pem")
	};
}

const fileOptions = {
	root: __dirname
}

const express = require("express");
const app = express();
const port = 8080;

// Init logging
const logFilePath = "latest.log";
fs.writeFileSync(logFilePath, ""); // be sure log file is empty

// Init CLI interface (allows to manipulate world cache)
serverline.init();
serverline.setPrompt("> ");
serverline.setCompletion(["cache", "exit"]);
serverline.on("line", function(line) {
	if (line == "cache clear") {
		console.log("Clearing world cache..");
		invalidateWorldCache();
		console.log("Done!");
	} else if (line == "cache peek") {
		if (!isWorldCacheValid()) {
			console.log("Cache hasn't been filled yet!");
		} else {
			console.debug("Peeking cache..");
			worldCache(function(err, worlds) {
				console.log("Done: " + util.inspect(worlds, {"colors": true}));
			});
		}
	} else if (line == "cache fill") {
		if (isWorldCacheValid()) {
			console.log("Cache is already filled, clear the cache first!");
		} else {
			console.debug("Filling cache..");
			worldCache(function(err, worlds) {
				console.debug("Done");
			});
		}
	} else if (line == "cache") {
		console.log("Usage: cache [clear|peek]");
	} else if (line == "exit") {
		process.exit();
	} else {
		console.log("Commands:");
		console.log("- cache [clear|peek]")
		console.log("- exit");
	}
});

serverline.on("SIGINT", function(line) {
	process.exit(0);
})

// Customize console.log functions //
function createLogFunction(original) {
	return function(obj) {
		original(obj);
		fs.appendFile(logFilePath, obj.toString() + "\n", function (err) {
			if (err) {
				throw err;
			}
		});
	}
}

let _log = createLogFunction(console.log);
let _warn = createLogFunction(console.warn);
let _error = createLogFunction(console.error);

console.log = function(obj) {
	let dateStr = new Date().toLocaleTimeString();
	if (typeof(obj) == "object") {
		obj = util.inspect(obj, {
			"colors": true
		});
	} else if (obj === undefined) {
		obj = "undefined";
	}
	_log("[ " + dateStr + " | LOG   ] " + obj.toString());
}

console.debug = function(obj, userId) {
	let dateStr = new Date().toLocaleTimeString();
	if (typeof(obj) == "object") {
		obj = util.inspect(obj, {
			"colors": true
		});
	} else if (obj === undefined) {
		obj = "undefined";
	}
	if (userId === undefined) {
		_log("[ " + dateStr + " | DEBUG ] " + obj.toString());
	} else {
		_log("[ " + dateStr + " | User " + userId + " | DEBUG ] " + obj.toString());
	}
}

console.info = function(obj) {
	let dateStr = new Date().toLocaleTimeString();
	_log("[ " + dateStr + " | INFO  ] " + obj.toString());
}

console.warn = function(obj) {
	let dateStr = new Date().toLocaleTimeString();
	_warn("[ " + dateStr + " | WARN  ] " + obj.toString());
}

console.error = function(obj) {
	let dateStr = new Date().toLocaleTimeString();
	_error("[ " + dateStr + " | ERROR ] " + obj.toString());
}

// Utility Functions //

// Get the auth token from a request object
getAuthToken = function(req) {
	let authToken = undefined;
	if (req.headers["bw-auth-token"] != undefined) {
		authToken = req.headers["bw-auth-token"];
	}
	return authToken;
}

// just internally used helper functions
value2 = function(v) {
	if (typeof(v) == "object") {
		return v[0];
	} else {
		return v;
	}
}

// Internally used
value = function(body, name) {
	let v = body[name];
	if (typeof(v) == "object") {
		return v[0];
	} else {
		return v;
	}
}

// Function used to validate an user's auth token and get to whom it belongs.
validAuthToken = function(req, res, bodyCheck) {
	let authToken = getAuthToken(req);
	if (authToken === undefined) {
		res.status(405).json({
			"error": 405,
			"error_msg": "missing authentication token"
		});
		return [false];
	}
	let userId = authTokens[authToken];
	if (userId == undefined) {
		res.status(405).json({
			"error": 405,
			"error_msg": "unauthentificated user"
		});
		return [false];
	}
	if (bodyCheck && (req.body == undefined || req.body == null)) {
		res.status(403).json({
			"error": "no body"
		});
		return [false];
	}
	return [true, userId, authToken];
}

// Helper function for Blocksworld's date formatting
datePart = function(num) {
	let str = num.toString();
	if (str.length < 2) {
		str = "0" + str;
	}
	return str;
}

// Format a 'Date' object in Blocksworld format.
dateString = function(date) {
	if (date == undefined || date == null) {
		date = new Date();
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

app.use(require("compression")());

app.use(function(req, res, next) {
	// Log queries
	let authToken = getAuthToken(req);
	let userId = undefined;
	if (authToken !== undefined) {
		userId = authTokens[authToken];
	}
	console.debug(req.method + " " + req.url, userId);

	res.set("Server", "bwapi");
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
app.use("/images", express.static("images")); // Serve the 'images' folder

// Init every modules
let cores = fs.readdirSync("modules");
for (i in cores) {
	let file = cores[i];
	console.debug("Init module " + file);
	require("./modules/" + file).run(app);
}

// Plain file hosting //

// Minify files at start of the program so they don't have to be minified each time.
let steamRemoteConf = JSON.stringify(JSON.parse(fs.readFileSync("conf/app_remote_configuration.json")));
app.get("/api/v1/steam-app-remote-configuration", function(req, res) {
	res.status(200).send(steamRemoteConf);
});

let contentCategories = JSON.stringify(JSON.parse(fs.readFileSync("conf/content_categories.json")));
app.get("/api/v1/content-categories-no-ip", function(req, res) {
	res.status(200).send(contentCategories);
});

let blocksPricings = JSON.stringify(JSON.parse(fs.readFileSync("conf/blocks_pricings.json")));
app.get("/api/v1/block_items/pricing", function(req, res) {
	res.status(200).send(blocksPricings);
});

app.get("/api/v1/store/coin_packs", function(req, res) {
	res.status(200).sendFile("conf/coin_packs.json", fileOptions);
});

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

if (useHttps) {
	httpsServer = https.createServer(options, app);
	httpsServer.listen(port);
} else {
	// still named httpsServer for compatibility purposes
	httpsServer = http.createServer(options, app);
	httpsServer.listen(port);
}

// Program startup is done
console.log("The server is ready!");
console.log("Note: If you want the server to be publicly accessible (outside your house), be sure to port-forward port 8080 (there are many tutorials on internet)")
