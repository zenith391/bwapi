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

const express = require("express");
const url = require("url");
const fs = require("fs");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

let dayLogins = 0;
let dayLoginsDate;

const ACCOUNTS_PATH = "/usr/local/nginx/html/users/";

function account_login(req, res) {
	const username = req.body.username;

	console.log(username + " is logging in (launcher)..")
	if (fs.existsSync(ACCOUNTS_PATH + username + ".json")) {
		const accountData = JSON.parse(fs.readFileSync(ACCOUNTS_PATH + username + ".json",
			{"encoding": "utf8"}));

		if (!accountData["security_version"] || accountData["security_version"] === 1) {
			console.log("Must BW Wool login.");
			res.status(401).json({
				"error": 401,
				"error_msg": "Please login on the Blocksworld Wool website then login on the Blocksworld Launcher.",
			});
			return;
		}
		const userId = accountData["bw_user_id"];
		bcrypt.compare(req.body.password, "$2a" + accountData.password.substring(3), function(err, result) { // PHP produces $2y$ althought they're actually $2a$
			console.log("Password valid: " + result);
			if (result) {
				if (!accountData["bw_link_id"]) {
					console.log("Must link account");
					res.status(401).json({
						"error": 401,
						"error_msg": "Link your account first!",
						"error_details": "link_account"
					});
					return;
				}
				if (!accountData["bw_user_id"] || isNaN(parseInt(accountData["bw_user_id"]))) {
					accountData["bw_user_id"] = fs.readFileSync("usersWoolLinks/" + accountData["bw_link_id"] + ".txt", {"encoding": "utf8"});
					fs.writeFileSync(ACCOUNTS_PATH + username + ".json", JSON.stringify(accountData));
				}
				let user = JSON.parse(fs.readFileSync("users/" + userId + "/metadata.json"));
				let updated = false;
				if (user["user_status"] == 1024 && EARLY_ACCESS) {
					user["user_status"] = 1028;
					console.log("Adding early access user status to user " + userId);
					updated = true;
				}
				if (updated) {
					fs.writeFileSync("users/" + userId + "/metadata.json", JSON.stringify(user));
				}

				const authToken = require("uuid/v4")();
				console.log("New auth token " + authToken + " for account " + username + " with user id " + userId);
				authTokens[authToken] = userId;
				res.status(200).json({
					"auth_token": authToken
				});
			} else {
				res.status(401).json({
					"error": 401,
					"error_msg": "Invalid password"
				});
			}
		});
	} else {
		res.status(401).json({
			"error": 401,
			"error_msg": "Invalid username or password. Do you have an account? If no, click the Register button"
		});
	}
}

function account_post_login(req, res) {
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

	let user = JSON.parse(fs.readFileSync("users/" + userId + "/metadata.json"));
	let updated = false;
	if ((user["user_status"] & 1024) == 0) {
		user["user_status"] |= 1024;
		updated = true;
	}
	if ((user["user_status"] & 4) == 0 && EARLY_ACCESS) {
		user["user_status"] |= 4;
		console.log("Adding early access user status to user " + userId);
		updated = true;
	}
	if (updated) {
		fs.writeFileSync("users/" + userId + "/metadata.json", JSON.stringify(user));
	}
	
	let worldTemplates = [];
	fs.readdir("conf/world_templates", function(err, files) {
		for (j in files) {
			let path = "conf/world_templates/" + files[j] + "/"
			let worldTemplate = JSON.parse(fs.readFileSync(path + "metadata.json"));
			worldTemplate["world_source"] = fs.readFileSync(path + "source.json", {"encoding": "utf8"});
			worldTemplates.push(worldTemplate);
		}
		user["auth_token"] = authToken;
		user["blocks_inventory_str"] = fs.readFileSync("conf/user_block_inventory.txt", {"encoding":"utf8"});
		user["world_templates"] = worldTemplates;
		user["_SERVER_worlds"] = undefined;
		user["_SERVER_models"] = undefined;
		user["_SERVER_groups"] = undefined;
		user["api_v2_supported"] = true;

		let date = new Date();
		let line = date.toLocaleDateString("en-US");
		let csv = fs.readFileSync("active_players.csv").toString();
		let lines = csv.split("\n");
		let lastLine = lines[lines.length-1].split(",");
		if (lastLine[0] == line) {
			dayLogins = parseInt(lastLine[1]) + 1;
			lines[lines.length-1] = line + "," + dayLogins;
			fs.writeFileSync("active_players.csv", lines.join("\n"));
		} else {
			dayLogins = 1; // we changed day
			fs.appendFileSync("active_players.csv", "\n" + line + "," + dayLogins);
		}
		res.status(200).json(user);
		console.log("Auth token login done!");
	});
}

function change_username(req, res) {
	let valid = validAuthToken(req, res, true);
	if (!valid[0]) {
		return;
	}
	let userId = valid[1];
	let nickname = req.body["steam_nickname"];
	let userMeta = userMetadata(userId);
	console.log("Changed name of " + userMeta["username"] + " (" + userId + ") to " + nickname);
	userMeta["username"] = nickname;
	fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(userMeta));
	res.status(200).json(userMeta);
}

function create_account(req, res) {
	const username = req.body.username;
	console.log(username + " is creating a profile (launcher)..")
	if (fs.existsSync(ACCOUNTS_PATH + username + ".json")) {
		const accountData = JSON.parse(fs.readFileSync(ACCOUNTS_PATH + username + ".json",
			{"encoding": "utf8"}));

		if (accountData["bw_link_id"]) {
			console.log("Account already liinked");
			res.status(401).json({
				"error": 401,
				"error_msg": "The account is already linked!",
			});
			return;
		}
		const userId = accountData["bw_user_id"];
		bcrypt.compare(req.body.password, "$2a" + accountData.password.substring(3), function(err, result) { // PHP produces $2y$ althought they're actually $2a$
			console.log("Password valid: " + result);
			if (result) {
				fs.readFile("conf/new_account_id.txt", {"encoding": "utf8"}, function(err, newId) {
					if (err != null)
						throw err;
					fs.writeFileSync("conf/new_account_id.txt", (parseInt(newId)+1).toString());
					fs.mkdirSync("users/"+newId);
					let newUserStatus = 1024; // "bw wool account" flag
					if (EARLY_ACCESS)
						newUserStatus += 4; // add "early access" flag
					let userInfo = {
						"coins": 100,
						"ios_link_available": false,
						"ios_link_initiated": false,
						"is_username_blocked": false,
						"profile_image_url": HOST + "/images/categories/default_pfp.png",
						"id": parseInt(newId),
						"username": username,
						"user_status": newUserStatus, // see Util.cs in Blocksworld source code for info about user_status
						"account_type": "user",
						"blocksworld_premium": 0,
						"_SERVER_worlds": [],
						"_SERVER_models": [],
						"_SERVER_groups": []
					}
					fs.writeFileSync("users/"+newId+"/metadata.json", JSON.stringify(userInfo));
					fs.writeFileSync("users/"+newId+"/followed_users.json", "{\"attrs_for_follow_users\": {}}");
					fs.writeFileSync("users/"+newId+"/followers.json", "{\"attrs_for_follow_users\": {}}");
					fs.writeFileSync("users/"+newId+"/liked_worlds.json", "{\"worlds\": []}");
					fs.writeFileSync("users/"+newId+"/played_worlds.json", "{\"worlds\": []}");
					fs.writeFileSync("users/"+newId+"/world_ratings.json", "{\"ratings\": {}}");
					fs.writeFileSync("users/"+newId+"/model_ratings.json", "{\"ratings\": {}}");
					fs.writeFileSync("users/"+newId+"/pending_payouts.json", "{\"pending_payouts\": []}");
					fs.writeFileSync("users/"+newId+"/news_feed.json", JSON.stringify({
						"news_feed": [{ "type": 101, "timestamp": dateString() }]
					}));

					let date = new Date();
					let line = date.toLocaleDateString("en-US");
					let csv = fs.readFileSync("total_players.csv").toString();
					let lines = csv.split("\n");
					let lastLine = lines[lines.length-1].split(",");
					const totalWorlds = fs.readdirSync("users").length-2+3;
					if (lastLine[0] == line) {
						lines[lines.length-1] = line + "," + totalWorlds;
						fs.writeFileSync("total_players.csv", lines.join("\n"));
					} else {
						fs.appendFileSync("total_players.csv", "\n" + line + "," + totalWorlds);
					}

					const uuid = require("uuid/v4")();
					fs.writeFile("usersWoolLinks/" + uuid + ".txt", newId, function(err) {
						if (err) throw err;
						accountData["bw_link_id"] = uuid;
						accountData["bw_user_id"] = newId;
						fs.writeFileSync(ACCOUNTS_PATH + username + ".json", JSON.stringify(accountData));

						const authToken = require("uuid/v4")();
						authTokens[authToken] = newId;
						res.status(200).json({
							"auth_token": authToken
						});
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

module.exports.run = function(app) {
	app.post("/api/v2/account/login", account_login);
	app.post("/api/v2/account/login/auth_token", account_post_login);
	app.post("/api/v2/account/username", change_username);
	app.post("/api/v2/account", function(req, res) { // deprecated
		res.status(500).json({
			"error": 500,
			"error_msg": "Please upgrade to the new Blocksworld Launcher version."
		});
	});
	app.post("/api/v2/account/link", create_account);
}
