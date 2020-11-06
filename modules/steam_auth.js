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

let dayLogins = 0;
let dayLoginsDate;

function steam_current_user(req, res, u) {
	let steam_id = u.query.steam_id
	let auth_ticket = u.query.steam_auth_ticket

	console.log(steam_id + " is logging in (steam)..");
	if (fs.existsSync("usersSteamLinks/" + steam_id + ".txt")) {
		let userId = fs.readFileSync("usersSteamLinks/"+steam_id+".txt",
			{"encoding": "utf8"})
		let user = JSON.parse(fs.readFileSync("users/"+userId+"/metadata.json"));
		let updated = false;
		if (user["user_status"] == 2 && EARLY_ACCESS) {
			user["user_status"] = 6;
			console.log("Adding early access user status to user " + userId);
			updated = true;
		}
		if (!user["account_type"]) {
			user["account_type"] = "user";
			console.log("Adding 'account_type' to user " + userId);
			updated = true;
		}
		if (!user["_SERVER_groups"]) {
			user["_SERVER_groups"] = [];
			console.log("Adding '_SERVER_groups' to user " + userId);
			updated = true;
		}
		if (updated)
			fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(user));
		let authToken = require("uuid/v4")();
		let worldTemplates = [];
		if (!fs.existsSync("users/"+userId+"/world_ratings.json")) {
			fs.writeFileSync("users/"+userId+"/world_ratings.json", "{\"ratings\": {}}");
		}
		if (!fs.existsSync("users/"+userId+"/pending_payouts.json")) {
			fs.writeFileSync("users/"+userId+"/pending_payouts.json", "{\"pending_payouts\": []}");
		}
		if (!fs.existsSync("users/"+userId+"/model_ratings.json")) {
			fs.writeFileSync("users/"+userId+"/model_ratings.json", "{\"ratings\": {}}");
		}
		if (!fs.existsSync("users/" + userId + "/friends.json")) {
			fs.writeFileSync("users/" + userId + "/friends.json", "{\"friends\": {}}");
		}
		fs.readdir("conf/world_templates", function(err, files) {
			for (j in files) {
				let path = "conf/world_templates/" + files[j] + "/"
				let worldTemplate = JSON.parse(fs.readFileSync(path + "metadata.json"));
				worldTemplate["world_source"] = fs.readFileSync(path + "source.json", {"encoding": "utf8"});
				worldTemplates.push(worldTemplate);
			}
			console.log("New auth token " + authToken + " for Steam user " + userId);
			user["auth_token"] = authToken;
			user["blocks_inventory_str"] = fs.readFileSync("conf/user_block_inventory.txt", {"encoding":"utf8"});
			user["world_templates"] = worldTemplates;
			user["_SERVER_worlds"] = undefined;
			user["_SERVER_models"] = undefined;
			user["_SERVER_groups"] = undefined;
			user["api_v2_supported"] = true;
			authTokens[authToken] = userId;

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
			console.log("Steam login done!");
		});
	} else {
		console.log("no such user");
		res.status(404).json({
			"error": 404,
			"error_msg": "no steam user with id " + steam_id
		});
	}
} 

function steam_set_username(req, res) {
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

function create_steam_user(req, res) {
	let steamId = req.body["steam_id"];
	let steamAuthTicket = req.body["steam_auth_ticket"];
	let persona = req.body["steam_persona"];
	let nickname = req.body["steam_nickname"];
	fs.readFile("conf/new_account_id.txt", function(err, data) {
		if (err != null)
			console.log(err);
		let newId = data;
		console.log("Create new Steam user " + newId + " (steam id " + steamId + ")")
		fs.writeFileSync("conf/new_account_id.txt", (parseInt(newId)+1).toString());
		fs.writeFileSync("usersSteamLinks/" + steamId + ".txt", newId);
		fs.mkdirSync("users/"+newId);
		let newUserStatus = 2; // "steam account" flag
		if (EARLY_ACCESS)
			newUserStatus += 4; // add "early access" flag
		let userInfo = {
			"coins": 100,
			"ios_link_available": false,
			"ios_link_initiated": false,
			"is_username_blocked": false,
			"profile_image_url": "https://cdn.discordapp.com/attachments/645634229136261120/645660160769130498/octoberthinking.png",
			"id": parseInt(newId),
			"username": persona,
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
			"news_feed": [
				{
					"type": 101,
					"timestamp": dateString()
				}
			]
		}));
		steam_current_user(req,res,{
			"query": {
				"steam_id": steamId,
				"steam_auth_ticket": steamAuthTicket
			}
		});
	});
}

module.exports.run = function(app) {
	if (!fs.existsSync("usersSteamLinks")) {
		fs.mkdirSync("usersSteamLinks");
		console.log("Created folder \"usersSteamLinks\"");
	}

	dayLoginsDate = new Date();

	app.get("/api/v1/steam_current_user", function(req, res) {
		steam_current_user(req, res, url.parse(req.url, true))
	});
	app.get("/api/v1/steam_current_user/locale", function(req, res) {
		res.status(404).json({"error":404}).end();
	});
	app.post("/api/v1/steam_current_user/username", express.urlencoded({"extended":false}), steam_set_username);
	app.post("/api/v1/steam_users", express.urlencoded({"extended":false}), create_steam_user);
}
