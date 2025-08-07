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
import url from "url";
import fs from "fs";
import bcrypt from "bcrypt";
import crypto from "crypto";
import uuid from "uuid";
import { User } from "./users.js";

let dayLogins = 0;
let dayLoginsDate;

const ACCOUNTS_PATH = "/etc/nginx/html/users/";

export async function loginToAccount(username, password) {
	if (fs.existsSync(ACCOUNTS_PATH + username + ".json")) {
		const accountData = JSON.parse(fs.readFileSync(ACCOUNTS_PATH + username + ".json",
			{"encoding": "utf8"}));

		if (!accountData["security_version"] || accountData["security_version"] === 1) {
			console.log("Must BW Wool login.");
			throw new Error("Please login on the Blocksworld Wool website then login on the Blocksworld Launcher.");
		}
		const userId = accountData["bw_user_id"];
		bcrypt.compare(password, "$2a" + accountData.password.substring(3), async function(err, result) { // PHP produces $2y$ althought they're actually $2a$
			console.log("Password valid: " + result);
			if (result) {
				if (!accountData["bw_link_id"]) {
					throw new Error("link_account");
				}
				if (!accountData["bw_user_id"] || isNaN(parseInt(accountData["bw_user_id"]))) {
					accountData["bw_user_id"] = fs.readFileSync("usersWoolLinks/" + accountData["bw_link_id"] + ".txt", {"encoding": "utf8"});
					fs.writeFileSync(ACCOUNTS_PATH + username + ".json", JSON.stringify(accountData));
				}

				const user = new User(userId);
				const userStatus = await user.getStatus();
				if (EARLY_ACCESS && (userStatus & 4) == 0) {
					await user.setStatus(userStatus | 4);
					console.log("Adding early access user status to user " + userId);
				}

				const authToken = uuid.v4();
				console.log("New auth token " + authToken + " for account " + username + " with user id " + userId);
				authTokens[authToken] = userId;
				return authToken;
			} else {
				throw new Error("Invalid password");
			}
		});
	} else {
		throw new Error("Invalid username or password. Do you have an account? If no, click the Register button");
	}
}

async function account_login(req, res) {
	console.log(req.body.username + " is logging in (launcher)..")
	try {
		const authToken = await loginToAccount(req.body.username, req.body.password);
	} catch (e) {
		console.log("Login failed with error " + e.message);
		if (e.message == "link_account") {
			res.status(401).json({
				"error": 401,
				"error_msg": "Link your account first!",
				"error_details": "link_account"
			});
		} else {
			req.status(401).json({
				"error": 401,
				"error_msg": e.message
			});
		}
	}
}

async function account_post_login(req, res) {
	const authToken = req.body.auth_token;
	const userId = authTokens[authToken];
	if (userId === undefined) {
		res.status(404).json({
			"error": 404,
			"error_msg": "Invalid auth token"
		});
		return;
	}

	console.log(authToken + " is logging in (auth token)..");

	const user = new User(userId);
	const userStatus = await user.getStatus();
	if ((userStatus & 1024) == 0) {
		await user.setStatus(userStatus | 1024);
	}

	let metadata = await user.getMetadata();
	let worldTemplates = [];
	fs.readdir("conf/world_templates", function(err, files) {
		for (const j in files) {
			let path = "conf/world_templates/" + files[j] + "/"
			let worldTemplate = JSON.parse(fs.readFileSync(path + "metadata.json"));
			worldTemplate["world_source"] = fs.readFileSync(path + "source.json", {"encoding": "utf8"});
			worldTemplates.push(worldTemplate);
		}
		metadata["auth_token"] = authToken;
		metadata["blocks_inventory_str"] = fs.readFileSync("conf/user_block_inventory.txt", {"encoding":"utf8"});
		metadata["world_templates"] = worldTemplates;
		metadata["_SERVER_worlds"] = undefined;
		metadata["_SERVER_models"] = undefined;
		metadata["_SERVER_groups"] = undefined;
		metadata["api_v2_supported"] = true;

		let date = new Date();
		let line = date.toLocaleDateString("en-US");
		let csv = fs.readFileSync("launcher_active_players.csv").toString();
		let lines = csv.split("\n");
		let lastLine = lines[lines.length-1].split(",");
		if (lastLine[0] == line) {
			dayLogins = parseInt(lastLine[1]) + 1;
			lines[lines.length-1] = line + "," + dayLogins;
			fs.writeFileSync("launcher_active_players.csv", lines.join("\n"));
		} else {
			dayLogins = 1; // we changed day
			fs.appendFileSync("launcher_active_players.csv", "\n" + line + "," + dayLogins);
		}
		res.status(200).json(metadata);
		console.log("Auth token login done!");
	});
}

async function create_account(req, res) {
	const username = req.body.username;
	console.log(username + " is creating a profile (launcher)..")
	if (fs.existsSync(ACCOUNTS_PATH + username + ".json")) {
		const accountData = JSON.parse(fs.readFileSync(ACCOUNTS_PATH + username + ".json",
			{"encoding": "utf8"}));

		if (accountData["bw_link_id"]) {
			console.log("Account already linked");
			res.status(401).json({
				"error": 401,
				"error_msg": "The account is already linked!",
			});
			return;
		}
		const userId = accountData["bw_user_id"];
		bcrypt.compare(req.body.password, "$2a" + accountData.password.substring(3), async function(err, result) { // PHP produces $2y$ althought they're actually $2a$
			console.log("Password valid: " + result);
			if (result) {
				const newUser = await User.create(username, 1024);
				const newId = newUser.id;

				const id = uuid.v4();
				fs.writeFile("usersWoolLinks/" + id + ".txt", newId.toString(), function(err) {
					if (err) throw err;
					accountData["bw_link_id"] = id;
					accountData["bw_user_id"] = newId;
					fs.writeFileSync(ACCOUNTS_PATH + username + ".json", JSON.stringify(accountData));

					const authToken = uuid.v4();
					authTokens[authToken] = newId;
					res.status(200).json({
						"auth_token": authToken
					});
				});
			} else {
				res.status(401).json({
					"error": 401,
					"error_msg": "Invalid password"
				});
			}
		});
	} else {
		console.log("Doesn't exist");
		res.status(401).json({
			"error": 401,
			"error_msg": "Invalid username or password"
		});
	}
}

async function validate_auth_token(req, res) {
	const u = url.parse(req.url, true);
	const authToken = u.query.auth_token;
	if (!authToken) {
		res.status(400).json({
			"error": 400,
			"error_msg": "Missing 'auth_token' query string"
		});
		return;
	}

	if (authTokens[authToken] != undefined) {
		const user = new User(authTokens[authToken]);
		res.status(200).json({
			"validated": true,
			"username": await user.getUsername()
		});
	} else {
		res.status(200).json({
			"validated": false
		})
	}
}

export function run(app) {
	app.post("/api/v2/account/login", account_login);
	app.post("/api/v2/account/login/auth_token", account_post_login);
	app.get("/api/v2/account/validate", validate_auth_token);
	app.post("/api/v2/account/link", create_account);
	
	app.post("/api/v2/account", function(req, res) { // deprecated
		res.status(500).json({
			"error": 500,
			"error_msg": "Please upgrade to the new Blocksworld Launcher version."
		});
	});
}
