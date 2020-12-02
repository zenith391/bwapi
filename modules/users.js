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

const fs = require("fs");
const url = require("url");

// Functions exported to global //
userMetadata = function(id) {
	if (!fs.existsSync("users/"+id))
		return null;
	let metadata = JSON.parse(fs.readFileSync("users/"+id+"/metadata.json"));
	return metadata;
}

socialUser = function(id, date) {
	let metadata = userMetadata(id);
	return {
		"user_id": parseInt(id),
		"username": metadata["username"],
		"user_status": metadata["user_status"],
		"user_blocksworld_premium": metadata["user_status"],
		"started_following_at": date,
		"profile_image_url": metadata["profile_image_url"],
		"relationship": 2
	}
}

addPayout = function(id, payout) {
	let nextId = 0;
	let payouts = JSON.parse(fs.readFileSync("users/"+id+"/pending_payouts.json"));
	for (i in payouts["pending_payouts"]) {
		nextId = Math.max(nextId, i+1);
	}
	if (!Array.isArray(payouts["pending_payouts"])) {
		payouts["pending_payouts"] = [];
	}
	payout["ref_id"] = nextId+1;
	payouts["pending_payouts"].push(payout);
	fs.writeFileSync("users/"+id+"/pending_payouts.json", JSON.stringify(payouts));
}

// Module code //
function basic_info(req, res) {
	let userId = req.params.id
	if (!fs.existsSync("users/" + userId + "/metadata.json")) {
		res.status(404).json({
			"error": 404,
			"error_msg": "user not found."
		});
	}
	let metadata = JSON.parse(fs.readFileSync("users/"+userId+"/metadata.json"));
	let json = {
		"id": metadata.id,
		"username": metadata.username,
		"is_username_blocked": metadata.is_username_blocked,
		"is_image_locked": metadata.is_image_locked,
		"user_status": metadata.user_status,
		"account_type": metadata["account_type"],
		"blocksworld_premium": metadata.blocksworld_premium,
		"profile_image_url": metadata.profile_image_url,
		"coins": metadata.coins
	}
	if (metadata["account_type"] == "group") {
		json["worlds_ids"] = metadata["_SERVER_worlds"];
		json["owner_id"] = metadata["owner_id"];
		let members = [];
		for (i in metadata["members"]) {
			members.push(userMetadata(metadata["members"][i]).username);
		}
		json["members_usernames"] = members;
		json["members_ids"] = metadata["members"];
	}
	res.status(200).json(json);
}

function save_current_user_profile_world(req, res) {
	let valid = validAuthToken(req, res, false);
	if (!valid[0]) {
		return;
	}
	let userId = valid[1];
	console.log("User " + userId + " uploading his profile world.");
	if (!fs.existsSync("users/"+userId+"/profile_world")) {
		fs.mkdirSync("users/"+userId+"/profile_world");
		fs.copyFileSync("conf/default_profile_world.txt", "users/"+userId+"/profile_world/source.json");
		fs.writeFileSync("users/"+userId+"/profile_world/metadata.json",
			JSON.stringify({
				"app_version": req.headers["bw-app-version"],
				"author_id": parseInt(userId),
				"image_urls_for_sizes": {},
				"profile_gender": "unknown",
				"updated_at_timestamp": Date.now()
			}));
	}
	let meta = JSON.parse(fs.readFileSync("users/"+userId+"/profile_world/metadata.json"));
	if (req.body["source_json_str"]) {
		fs.writeFileSync("users/"+userId+"/profile_world/source.json", req.body["source_json_str"]);
	}
	if (req.body["avatar_source_json_str"]) {
		fs.writeFileSync("users/"+userId+"/profile_world/avatar_source.json", req.body["avatar_source_json_str"]);
	}
	if (req.body["profile_gender"]) {
		meta["profile_gender"] = req.body["profile_gender"];
	}
	meta["updated_at_timestamp"] = Date.now();
	fs.writeFileSync("users/"+userId+"/profile_world/metadata.json", JSON.stringify(meta));
	let userMeta = userMetadata(userId)
	if (userMeta["is_image_locked"] != true) {
		if (req.files["profile_image"]) {
			fs.copyFileSync(req.files["profile_image"][0].path, "images/profiles/"+userId+".jpg");
			userMeta["profile_image_url"] = "https://bwsecondary.ddns.net:8080/images/profiles/"+userId+".jpg";
			fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(userMeta));
		}
	}
	res.status(200).json(userMeta);
}

function current_user_profile_world(req, res) {
	let valid = validAuthToken(req, res, false);
	if (!valid[0]) {
		return;
	}
	let userId = valid[1];
	console.log("User " + userId + " downloading his profile world.");
	if (!fs.existsSync("users/"+userId+"/profile_world")) {
		fs.mkdirSync("users/"+userId+"/profile_world");
		fs.copyFileSync("conf/default_profile_world.txt", "users/"+userId+"/profile_world/source.json");
		fs.writeFileSync("users/"+userId+"/profile_world/metadata.json",
			JSON.stringify({
				"app_version": req.headers["bw-app-version"],
				"author_id": parseInt(userId),
				"image_urls_for_sizes": {},
				"profile_gender": "unknown",
				"updated_at_timestamp": Date.now()
			}));
	}
	let userMeta = userMetadata(userId);
	let src = fs.readFileSync("users/"+userId+"/profile_world/source.json",{"encoding":"utf8"});
	let meta = JSON.parse(fs.readFileSync("users/"+userId+"/profile_world/metadata.json"));
	meta["image_url"] = userMeta["profile_image_url"];
	meta["source_json_str"] = src
	if (fs.existsSync("users/"+userId+"/profile_world/avatar_source.json")) {
		meta["avatar_source_json_str"] = fs.readFileSync("users/"+userId+"/profile_world/avatar_source.json",{"encoding":"utf8"});
	}
	meta = processUserWorld(meta)
	res.status(200).json(meta);
}

function current_user_worlds(req, res) {
	let is_published = url.parse(req.url, true).query.is_published
	let valid = validAuthToken(req, res, false);
	if (!valid[0]) {
		return;
	}
	let userId = valid[1];
	console.log("User " + userId + " downloading his worlds.");
	let user = JSON.parse(fs.readFileSync("users/"+userId+"/metadata.json"));
	user.worlds = [];
	for (i in user["_SERVER_worlds"]) {
		let id = user["_SERVER_worlds"][i];
		try {
			let w = fullWorldSync(id, true);
			if (is_published == "yes") {
				if (w.publication_status == 1) {
					user.worlds.push(w);
				}
			} else {
				user.worlds.push(w);
			}
		} catch (e) {
			console.debug(e);
			console.error("could not retrieve worlds for user " + userId + "!");
			res.status(200).json({
				"error": 404,
				"error_msg": "Could not load your worlds."
			});
		}
	}
	user["_SERVER_worlds"] = undefined;
	user["_SERVER_models"] = undefined;
	user["_SERVER_groups"] = undefined;
	res.status(200).json(user);
}

function current_user_worlds_for_teleport(req, res) {
	let valid = validAuthToken(req, res, false);
	if (!valid[0]) {
		return;
	}
	let userId = valid[1];
	let user = userMetadata(userId);
	let worlds = [];
	for (i in user["_SERVER_worlds"]) {
		let id = user["_SERVER_worlds"][i];
		try {
			let world = fullWorldSync(id, true);
			if (!world["image_urls_for_sizes"]["440x440"]) {
				world["image_urls_for_sizes"]["440x440"] = "test";
			}
			if (!world["image_urls_for_sizes"]["220x220"]) {
				world["image_urls_for_sizes"]["220x220"] = "test";
			}
			worlds.push(world);
		} catch (e) {
			console.debug(e);
			console.error("could not retrieve worlds for user " + userId + "!");
			res.status(200).json({
				"error": 404,
				"error_msg": "Could not load your worlds."
			});
		}
	}
	res.status(200).json({
		"worlds": worlds
	});
}

function follow(req, res) {
	let valid = validAuthToken(req, res, false);
	if (!valid[0]) {
		return;
	}
	let userId = parseInt(valid[1]);
	let targetId = parseInt(req.params["id"]);
	let user = JSON.parse(fs.readFileSync("users/"+userId+"/followed_users.json"));
	let target;
	if (fs.existsSync("users/"+targetId+"/followers.json")) {
		target = JSON.parse(fs.readFileSync("users/"+targetId+"/followers.json"))
	} else {
		res.status(404).json({
			"error": "the target doesn't exists"
		});
		return;
	}
	user["attrs_for_follow_users"]["u"+targetId] = dateString();
	target["attrs_for_follow_users"]["u"+userId] = dateString();
	fs.writeFile("users/"+userId+"/followed_users.json", JSON.stringify(user), function(err) {
		if (err) console.error(err);
		fs.writeFile("users/"+targetId+"/followers.json", JSON.stringify(target), function(err) {
			if (err) console.error(err);
			res.status(200).json({"ok":true});
		});
	});
}

function unfollow(req, res) {
	let valid = validAuthToken(req, res, false);
	if (!valid[0]) {
		return;
	}
	let userId = parseInt(valid[1]);
	let targetId = parseInt(req.params["id"]);
	let user = JSON.parse(fs.readFileSync("users/"+userId+"/followed_users.json"));
	let target;
	if (fs.existsSync("users/"+targetId+"/followers.json")) {
		target = JSON.parse(fs.readFileSync("users/"+targetId+"/followers.json"))
	} else {
		res.status(404).json({
			"error": "the target doesn't exists"
		});
		return;
	}
	user["attrs_for_follow_users"]["u"+targetId] = undefined;
	target["attrs_for_follow_users"]["u"+userId] = undefined;
	fs.writeFile("users/"+userId+"/followed_users.json", JSON.stringify(user), function(err) {
		if (err) throw err;
		fs.writeFile("users/"+targetId+"/followers.json", JSON.stringify(target), function(err) {
			if (err) throw err;
			res.status(200).json({"ok":true});
		});
	});
}

module.exports.run = function(app) {
	if (!fs.existsSync("users")) {
		fs.mkdirSync("users");
		console.log("Created folder \"users\"");
	}
	if (!fs.existsSync("conf/new_account_id.txt")) {
		fs.writeFileSync("conf/new_account_id.txt", "1")
		console.log("Created file \"conf/new_account_id.txt\"");
	}

	app.get("/api/v1/current_user/worlds", current_user_worlds);
	app.get("/api/v1/current_user/worlds_for_teleport", current_user_worlds_for_teleport);
	app.get("/api/v1/current_user/profile_world", current_user_profile_world);
	app.put("/api/v1/current_user/profile_world", save_current_user_profile_world);
	app.post("/api/v1/user/:id/follow_activity", follow);
	app.delete("/api/v1/user/:id/follow_activity", unfollow);

	app.get("/api/v1/user/:id/followed_users", function(req, res) {
		let id = req.params["id"];
		if (!fs.existsSync("users/"+id)) {
			res.status(404);
			return;
		}
		let out = [];
		try {
			let json = JSON.parse(fs.readFileSync("users/"+id+"/followed_users.json"))["attrs_for_follow_users"];
			for (i in json) {
				if (json[i] != undefined)
					out.push(socialUser(i.substring(1), json[i]));
			}
		} catch (e) {
			console.error(e);
		}
		res.status(200).json({
			"attrs_for_follow_users": out
		});
	});

	app.get("/api/v1/user/:id/followers", function(req, res) {
		let id = req.params["id"];
		if (!fs.existsSync("users/"+id)) {
			res.status(404);
			return;
		}
		let valid = validAuthToken(req, res, false);
		if (!valid[0]) {
			return;
		}
		let out = [];
		//if (valid[1] == id) {
			let json = JSON.parse(fs.readFileSync("users/"+id+"/followers.json"))["attrs_for_follow_users"];
			for (i in json) {
				if (json[i] != undefined)
					out.push(socialUser(i.substring(1), json[i]));
			}
		//}
		res.status(200).json({
			"attrs_for_follow_users": out
		});
	});

	app.post("/api/v1/current_user/collected_payouts", function(req, res) {
		let valid = validAuthToken(req, res, false);
		if (!valid[0]) {
			return;
		}
		let userId = valid[1];
		let userMeta = userMetadata(userId);
		let pending = JSON.parse(fs.readFileSync("users/"+userId+"/pending_payouts.json"));
		let payouts = req.body["payouts"];
		for (k in payouts) {
			let payout = payouts[k];
			for (i in pending["pending_payouts"]) {
				let pendingPayout = pending["pending_payouts"][i];
				if (pendingPayout["ref_id"] == payout["ref_id"]) {
					userMeta["coins"] = userMeta["coins"] + pendingPayout.coin_grants;
					pending["pending_payouts"].splice(i, 1);
				}
			}
		}
		fs.writeFile("users/"+userId+"/metadata.json", JSON.stringify(userMeta), function(err) {
			if (err) throw err;
			fs.writeFile("users/"+userId+"/pending_payouts.json", JSON.stringify(pending), function(err) {
				if (err) throw err;
				res.status(200).json({
					"attrs_for_current_user": userMeta
				});
			});
		});
	});

	app.get("/api/v1/current_user/pending_payouts", function(req, res) {
		let valid = validAuthToken(req, res, false);
		if (!valid[0]) {
			return;
		}
		let userId = valid[1];
		let pending = JSON.parse(fs.readFileSync("users/"+userId+"/pending_payouts.json"));
		res.status(200).json({
			"pending_payouts": pending["pending_payouts"]
		})
	});

	app.get("/api/v1/current_user/deleted_worlds", function(req, res) {
		res.status(200).json({
			"worlds": []
		});
	});

	app.get("/api/v1/users/:id/liked_worlds", function(req, res) {
		let id = req.params["id"];
		if (!fs.existsSync("users/"+id)) {
			res.status(404);
			return;
		}
		if (!fs.existsSync("users/"+id+"/liked_worlds.json")) {
			res.status(200).json({
				"worlds": []
			});
			return;
		}
		res.status(200).sendFile("users/"+id+"/liked_worlds.json", fileOptions);
	});

	app.get("/api/v1/users/:id/basic_info", basic_info);
}
